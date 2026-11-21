import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

test('a stopped content request updates the lifecycle gate without marking the network offline', async () => {
  class CanvasError extends Error {
    constructor() { super('Workspace stopped'); this.code = 'WORKSPACE_STOPPED'; this.statusCode = 423 }
  }
  const stopped = new CanvasError()
  const events = []
  let failures = 0
  const dependencies = {
    '@augmentd-labs/canvas-api-client': {
      CanvasError, isNetworkError: () => false,
      CanvasApiClient: class { async request() { throw stopped } },
    },
    '@/config/api': { API_URL: 'https://canvas.test/rest/v2' },
    './error-handler': { handleApiError() { assert.fail('Stopped workspaces are handled inline') } },
    './api-network-error': { isBrowserNetworkFailure: () => false, isGatewayFailure: () => false },
    './connectivity': { reportNetworkFailure() { failures++ }, reportNetworkSuccess() {}, onConnectivityChange() {}, isOffline: () => false, reportStalledRequest() {}, STALLED_REQUEST_MS: 8000 },
  }
  const exports = {}
  const source = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, Error, CustomEvent, decodeURIComponent,
    require: name => dependencies[name],
    localStorage: { getItem: key => key === 'authToken' ? 'canvas-test-auth-token' : 'canvas.test' },
    window: { dispatchEvent: event => events.push(event), location: { pathname: '/workspaces/test' } },
  })
  await assert.rejects(exports.api.get('https://canvas.test/rest/v2/workspaces/universe-2/documents'), error => error === stopped)
  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'workspace:stopped')
  assert.deepEqual(Array.from(events[0].detail.refs), ['universe-2'])
  assert.equal(failures, 0)
})

test("a proxy's error page for an unreachable server marks the network offline", async () => {
  const networkError = await import('../src/lib/api-network-error.ts')
  class CanvasError extends Error {}
  let offline = false
  let handled = 0
  let response
  const dependencies = {
    '@augmentd-labs/canvas-api-client': {
      CanvasError, isNetworkError: () => false,
      // The shared client's contract: a rejected fetch becomes a CanvasError
      // without a status, an HTTP error one with it.
      CanvasApiClient: class {
        constructor(options) { this.fetch = options.fetch }
        async request() {
          let res
          try { res = await this.fetch('https://canvas.test/rest/v2/workspaces') } catch (error) { throw new CanvasError(error.message) }
          if (res.status >= 400) throw Object.assign(new CanvasError('Request failed'), { statusCode: res.status })
          return {}
        }
      },
    },
    '@/config/api': { API_URL: 'https://canvas.test/rest/v2' },
    './error-handler': { handleApiError() { handled++ } },
    './api-network-error': networkError,
    './connectivity': { reportNetworkFailure() { offline = true }, reportNetworkSuccess() { offline = false }, onConnectivityChange() {}, isOffline: () => offline, reportStalledRequest() {}, STALLED_REQUEST_MS: 8000 },
  }
  const exports = {}
  const source = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, Error, TypeError, AbortController, setTimeout, clearTimeout, console: { error() {} },
    require: name => dependencies[name],
    fetch: async () => response,
    localStorage: { getItem: key => key === 'authToken' ? 'canvas-test-auth-token' : 'canvas.test' },
    window: { location: { pathname: '/workspaces' } },
  })
  const answer = (status, type) => ({ status, headers: new Headers({ 'content-type': type }) })

  for (const status of [502, 503, 504]) {
    offline = false
    response = answer(status, 'text/html')
    await assert.rejects(exports.api.get('https://canvas.test/rest/v2/workspaces'), /Network error:/)
    assert.equal(offline, true, `${status} from the proxy`)
  }
  assert.equal(handled, 0, 'no toast per failed request')

  // Canvas answering 503 itself (a workspace not ready) is a reachable server.
  response = answer(503, 'application/json; charset=utf-8')
  await assert.rejects(exports.api.get('https://canvas.test/rest/v2/workspaces'))
  assert.equal(offline, false)

  offline = true
  response = answer(200, 'application/json')
  await exports.api.get('https://canvas.test/rest/v2/workspaces')
  assert.equal(offline, false)
})
