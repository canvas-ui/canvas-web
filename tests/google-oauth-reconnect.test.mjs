import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { createRequire } from 'node:module'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

const require = createRequire(import.meta.url)
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText

test('existing Google connection can reconnect with a blank secret; new connections still require one', () => {
  const exports = {}
  vm.runInNewContext(compile('../src/components/settings/GoogleOAuthButton.tsx'), {
    exports, require: name => {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name)
      if (name === '@/components/ui/button') return { Button: props => createElement('button', props) }
      if (name === '@iconify/react') return { Icon: () => null }
      if (name === '@/components/ui/use-toast') return { useToast: () => ({ showToast() {} }) }
      return {}
    },
  })
  const props = { clientId: 'client', clientSecret: '', scope: 'drive', onLinked() {} }
  const render = extra => renderToStaticMarkup(createElement(exports.GoogleOAuthButton, { ...props, ...extra }))
  assert.match(render({}), /disabled=""/)
  const backend = { workspaceId: 'universe', driver: 'gdrive', address: 'person@example.test' }
  assert.doesNotMatch(render({ backend }), /disabled=""/)
  assert.match(render({ backend }), /Uses your saved client secret/)
  assert.match(render({ backend, disabled: true }), /disabled=""/)
  assert.doesNotMatch(render({ clientSecret: 'typed-secret' }), /disabled=""/)
})

test('popup result exchanges the code with the selected backend, never sends a saved secret', async () => {
  const calls = []
  let onMessage
  const popup = { location: {}, closed: false, close() {} }
  const window = {
    location: { origin: 'https://canvas.test' }, open: () => popup,
    addEventListener: (_name, callback) => { onMessage = callback },
    removeEventListener() {}, setInterval: () => 1, setTimeout: () => 2,
    clearInterval() {}, clearTimeout() {},
  }
  const api = { post: async (path, body) => {
    calls.push({ path, body })
    return path === '/oauth/google/start'
      ? { url: 'https://accounts.google.com/consent', state: 'nonce', expiresInMs: 60000 }
      : { refreshToken: 'renewed', account: 'person@example.test' }
  } }
  const exports = {}
  vm.runInNewContext(compile('../src/services/oauth.ts'), {
    exports, window, URL, require: name => name === '@/lib/api' ? { api } : { API_URL: '/rest/v2' },
  })
  const result = exports.linkGoogleAccount({
    clientId: 'client', clientSecret: '', scope: 'drive',
    backend: { workspaceId: 'universe', driver: 'gdrive', address: 'person@example.test' },
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(calls[0].body.exchangeInWorkspace, true)
  assert.equal(calls[0].body.clientSecret, '')
  const data = { type: 'canvas:oauth', provider: 'google', state: 'nonce', ok: true, code: 'code', redirectUri: 'https://canvas.test/callback' }
  onMessage({ origin: window.location.origin, source: {}, data })
  assert.equal(calls.length, 1)
  onMessage({ origin: window.location.origin, source: popup, data })
  assert.equal((await result).refreshToken, 'renewed')
  assert.equal(calls[1].path, '/workspaces/universe/backends/gdrive/person%40example.test/oauth/google/exchange')
  assert.equal(calls[1].body.code, 'code')
  assert.equal('clientSecret' in calls[1].body, false)
})
