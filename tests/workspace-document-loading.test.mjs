import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

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
    unfiledOnly: false, backendTarget: null, docScope: 'path', tbLensIds: null,
    currentPage: 1, pageSize: 50, serverSearchQueries: [], tbFiltersKey: '', tbFiltersKeyNoLens: '',
    isLayerView: false, selectedLayerId: null, queryDebug: false,
    tbAllOf: [], tbAnyOf: [], tbNoneOf: [], tbScopeFilters: [], tbSort: { order: 'desc' },
    documentKey: () => 'inbox', documentCache: cache,
    getWorkspaceDocuments: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    setIsLoadingDocuments: value => { state.loading = value },
    setDocuments: value => { state.documents = typeof value === 'function' ? value(state.documents) : value },
    setDocumentsTotalCount: value => { state.count = value },
    setQueryDebugData() {}, showToast() {},
  }
  vm.runInNewContext(code, context)
  return { fetch: context.fetchDocuments, state, pending, cache }
}

for (const newestFirst of [false, true]) {
  test(`background refresh completes foreground loading (newest first: ${newestFirst})`, async () => {
    const { fetch, state, pending } = build()
    const initial = fetch()
    const refresh = fetch({ silent: true })
    assert.equal(state.loading, true)
    if (!newestFirst) {
      pending[0].resolve({ payload: [{ id: 1 }] })
      await initial
      assert.equal(state.loading, true, 'an obsolete request cannot finish the newer load')
    }
    pending[1].resolve({ payload: [{ id: 2 }], totalCount: 1 })
    await refresh
    assert.equal(state.loading, false, 'arrived documents must be visible')
    if (newestFirst) {
      pending[0].resolve({ payload: [{ id: 1 }] })
      await initial
    }
    assert.equal(state.documents[0].id, 2)
  })
}

test('a cache hit superseding a pending load clears its spinner', async () => {
  const { fetch, state, pending, cache } = build()
  const initial = fetch()
  cache.set('inbox', { documents: [{ id: 2 }], totalCount: 1 })
  await fetch()
  assert.equal(state.loading, false)
  pending[0].resolve({ payload: [{ id: 1 }] })
  await initial
  assert.equal(state.documents[0].id, 2)
})

test('failed background refresh also releases the initial loading state', async () => {
  const { fetch, state, pending } = build()
  const initial = fetch()
  const refresh = fetch({ silent: true })
  pending[1].reject(new Error('Offline'))
  await refresh
  assert.equal(state.loading, false)
  pending[0].resolve({ payload: [{ id: 1 }] })
  await initial
  assert.equal(state.documents.length, 0)
})
