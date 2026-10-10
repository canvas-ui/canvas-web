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
    './api-network-error': { isBrowserNetworkFailure: () => false },
    './connectivity': { reportNetworkFailure() { failures++ }, reportNetworkSuccess() {} },
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
