import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { backendTrashLocation } from '../src/lib/backend-trash.ts'

function setup({ confirmed = true, failBatch = 0 } = {}) {
  const calls = [], confirmations = [], events = [], invalidations = []
  const items = Array.from({ length: 205 }, (_, n) => ({ id: `id-${n}`, key: n < 204 ? `WhatsApp/${n}.txt` : 'WhatsApp-old/keep.txt', deletedAt: n }))
  const dependencies = {
    '@/lib/api': { api: {
      get: async url => {
        calls.push({ method: 'GET', url })
        const second = new URL(url, 'http://test').searchParams.get('cursor')
        return { items: second ? items.slice(150) : items.slice(0, 150), cursor: second ? null : 'next', retention: { days: 30 } }
      },
      post: async (url, body) => {
        calls.push({ method: 'POST', url, body })
        if (failBatch && calls.filter(c => c.method === 'POST').length === failBatch) throw new Error('Offline')
        return { results: body.ids.map(id => ({ id, ok: true })) }
      },
    } },
    '@/config/api': { API_ROUTES: { workspaces: '/rest/v2/workspaces' } },
    '@/lib/backend-trash': { backendTrashLocation },
    '@/services/workspace': { invalidateWorkspaceTreeCache: (...args) => invalidations.push(args) },
  }
  const exports = {}
  const source = readFileSync(new URL('../src/services/backend-trash.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code, {
    exports, require: name => { assert.ok(name in dependencies, name); return dependencies[name] }, URLSearchParams,
    window: { confirm: text => { confirmations.push(text); return confirmed }, dispatchEvent: event => events.push(event) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail } },
  })
  return { actions: exports, calls, confirmations, events, invalidations }
}

test('canceling permanent deletion sends no mutation and shows the exact scope', async () => {
  const ui = setup({ confirmed: false })
  await ui.actions.discardBackendTrashPath('universe', '/Trash/workspace%3Ahome/WhatsApp')
  assert.equal(ui.calls.filter(c => c.method === 'POST').length, 0)
  assert.equal(ui.confirmations.length, 1)
  assert.match(ui.confirmations[0], /204 Trash item\(s\) from workspace:home/)
  assert.match(ui.confirmations[0], /WhatsApp\/0.txt/)
  assert.match(ui.confirmations[0], /cannot be undone/)
})

test('confirmed folder discard follows pagination, batches exact IDs and excludes sibling paths', async () => {
  const ui = setup()
  await ui.actions.discardBackendTrashPath('universe', '/Trash/workspace%3Ahome/WhatsApp')
  const posts = ui.calls.filter(c => c.method === 'POST')
  assert.deepEqual(posts.map(c => c.body.ids.length), [100, 100, 4])
  assert.ok(posts.every(c => c.url.endsWith('/backends/file/workspace%3Ahome/trash/discard')))
  const ids = posts.flatMap(c => Array.from(c.body.ids))
  assert.equal(new Set(ids).size, 204)
  assert.equal(ids.includes('id-204'), false)
  assert.ok(ui.events.some(e => e.type === 'workspace:trash:refresh'))
})

test('a failed later batch refreshes Trash after partial success', async () => {
  const ui = setup({ failBatch: 2 })
  await assert.rejects(ui.actions.discardBackendTrashPath('universe', '/Trash/workspace%3Ahome'), /Offline/)
  assert.equal(ui.calls.filter(c => c.method === 'POST').length, 2)
  assert.ok(ui.invalidations.length)
  assert.ok(ui.events.some(e => e.type === 'workspace:trash:refresh'))
})

test('discard deduplicates selected IDs, while restore keeps its own API route', async () => {
  const ui = setup()
  await ui.actions.discardBackendTrash('universe', 'workspace:home', ['a', 'a', 'b'])
  await ui.actions.restoreBackendTrash('universe', 'workspace:home', ['c'])
  const posts = ui.calls.filter(c => c.method === 'POST')
  assert.deepEqual(Array.from(posts[0].body.ids), ['a', 'b'])
  assert.ok(posts[0].url.endsWith('/discard'))
  assert.ok(posts[1].url.endsWith('/restore'))
})
