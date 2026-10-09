import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { backendTrashLocation } from '../src/lib/backend-trash.ts'

// Exercise the production fetch callback with controlled network completion
// order, without mounting the surrounding shell, maps and canvas widgets.
const source = ts.createSourceFile('workspace.tsx', readFileSync(new URL('../src/pages/workspaces/[workspaceName]/index.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let callback
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'fetchDocuments') callback ??= node.initializer.arguments[0]
  ts.forEachChild(node, visit)
}
visit(source)
assert.ok(callback)
const code = ts.transpileModule(`globalThis.fetchDocuments = ${callback.getText(source)}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText

function build() {
  const state = { loading: false, documents: [], count: 0 }
  const pending = []
  const cache = new Map()
  const context = {
    workspaceName: 'universe', selectedTreeName: 'backends', selectedPath: '/imap/me/inbox',
    sessionActiveRef: { current: false }, fetchSeqRef: { current: 0 }, fetchIdentityRef: { current: '' },
    documentFetchRef: { current: null },
    backendTrashLocation,
    unfiledOnly: false, backendTarget: null, docScope: 'path', tbLensIds: null,
    currentPage: 1, pageSize: 50, serverSearchQueries: [], tbFiltersKey: '', tbFiltersKeyNoLens: '',
    isLayerView: false, selectedLayerId: null, queryDebug: false,
    tbAllOf: [], tbAnyOf: [], tbNoneOf: [], tbScopeFilters: [], tbSort: { order: 'desc' },
    documentKey: (_workspace, _tree, path) => path, documentCache: cache,
    getWorkspaceDocuments: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    setIsLoadingDocuments: value => { state.loading = value },
    setDocuments: value => { state.documents = typeof value === 'function' ? value(state.documents) : value },
    setDocumentsTotalCount: value => { state.count = value },
    setQueryDebugData() {}, showToast() {},
  }
  vm.runInNewContext(code, context)
  return { fetch: context.fetchDocuments, state, pending, cache, context }
}

const finishMicrotasks = () => new Promise(resolve => setImmediate(resolve))

test('opening Trash skips document queries and discards a previous folder response', async () => {
  const { fetch, state, pending, context } = build()
  const initial = fetch()
  context.selectedPath = '/Trash/workspace%3Ahome'
  await fetch()
  assert.equal(pending.length, 1)
  assert.equal(state.loading, false)
  assert.equal(state.documents.length, 0)
  pending[0].resolve({ payload: [{ id: 1 }], totalCount: 1 })
  await initial
  assert.equal(state.documents.length, 0)
})

test('steady sync paints completed requests and coalesces refreshes into one follow-up', async () => {
  const { fetch, state, pending, cache, context } = build()
  const initial = fetch()
  for (let i = 0; i < 10; i++) void fetch({ silent: true })
  assert.equal(pending.length, 1, 'sync must not launch overlapping downloads')
  assert.equal(state.loading, true)
  pending[0].resolve({ payload: [{ id: 1 }], totalCount: 1 })
  await initial
  assert.equal(state.loading, false, 'the initial response must paint during sync')
  assert.equal(state.documents[0].id, 1)
  assert.equal(pending.length, 2, 'changes during the request need one fresh read')
  assert.equal(cache.has(context.selectedPath), false, 'a known dirty result must not be cached')

  for (let i = 0; i < 10; i++) void fetch({ silent: true })
  assert.equal(pending.length, 2)
  pending[1].resolve({ payload: [{ id: 2 }], totalCount: 1 })
  await finishMicrotasks()
  assert.equal(state.documents[0].id, 2, 'continued sync must not starve rendering')
  assert.equal(pending.length, 3)
  pending[2].resolve({ payload: [{ id: 3 }], totalCount: 1 })
  await finishMicrotasks()
  assert.equal(state.documents[0].id, 3)
  assert.equal(pending.length, 3)
})

test('an empty layer search finishes loading even while sync requests another refresh', async () => {
  const { fetch, state, pending, context } = build()
  context.isLayerView = true
  context.selectedTreeName = 'context'
  context.selectedLayerId = 'universe-layer'
  context.serverSearchQueries = ['pelican']
  context.getWorkspaceLayerDocuments = context.getWorkspaceDocuments
  const initial = fetch()
  void fetch({ silent: true })
  void fetch({ silent: true })
  assert.equal(pending.length, 1)
  pending[0].resolve({ payload: [], count: 0, totalCount: 0 })
  await initial
  assert.equal(state.loading, false)
  assert.deepEqual(state.documents, [])
  assert.equal(pending.length, 2)
  pending[1].resolve({ payload: [], count: 0, totalCount: 0 })
  await finishMicrotasks()
  assert.equal(pending.length, 2)
})

for (const newestFirst of [false, true]) {
  test(`navigation ignores the previous folder's response (newest first: ${newestFirst})`, async () => {
    const { fetch, state, pending, context } = build()
    const initial = fetch()
    void fetch({ silent: true })
    context.selectedPath = '/imap/me/drafts'
    const drafts = fetch()
    assert.equal(pending.length, 2, 'navigation must not wait for the old folder')
    if (!newestFirst) {
      pending[0].resolve({ payload: [{ id: 1 }] })
      await initial
      assert.equal(state.loading, true)
    }
    pending[1].resolve({ payload: [{ id: 2 }], totalCount: 1 })
    await drafts
    assert.equal(state.loading, false)
    if (newestFirst) {
      pending[0].resolve({ payload: [{ id: 1 }] })
      await initial
    }
    assert.equal(state.documents[0].id, 2)
    assert.equal(pending.length, 2, 'an obsolete queued refresh must not run')
  })
}

test('a cache hit superseding a pending load clears its spinner', async () => {
  const { fetch, state, pending, cache, context } = build()
  const initial = fetch()
  cache.set(context.selectedPath, { documents: [{ id: 2 }], totalCount: 1 })
  await fetch()
  assert.equal(state.loading, false)
  pending[0].resolve({ payload: [{ id: 1 }] })
  await initial
  assert.equal(state.documents[0].id, 2)
})

test('a failed initial load releases its spinner and still reconciles queued changes', async () => {
  const { fetch, state, pending } = build()
  const initial = fetch()
  void fetch({ silent: true })
  pending[0].reject(new Error('Offline'))
  await initial
  assert.equal(state.loading, false)
  assert.equal(state.documents.length, 0)
  assert.equal(pending.length, 2)
  pending[1].resolve({ payload: [{ id: 1 }], totalCount: 1 })
  await finishMicrotasks()
  assert.equal(state.documents[0].id, 1)
})

test('a delayed invalidation refresh bypasses a repopulated cache', async () => {
  const { fetch, state, pending, cache, context } = build()
  cache.set(context.selectedPath, { documents: [{ id: 1 }], totalCount: 1 })
  const refresh = fetch({ silent: true })
  assert.equal(pending.length, 1)
  pending[0].resolve({ payload: [{ id: 2 }], totalCount: 1 })
  await refresh
  assert.equal(state.documents[0].id, 2)
})
