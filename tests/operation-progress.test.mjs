import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const page = ts.createSourceFile('workspace.tsx', readFileSync(new URL('../src/pages/workspaces/[workspaceName]/index.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function handler(name, context) {
  let callback
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(page) === name) callback = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(page)
  assert.ok(callback, name)
  const code = ts.transpileModule(`globalThis.action = ${callback.getText(page)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code, context)
  return context.action
}
function progressContext() {
  const notices = [], requests = []
  const request = () => new Promise((resolve, reject) => requests.push({ resolve, reject }))
  const context = {
    Error, listedTotalCount: 5001, disablePurgeDocuments: false, purgePendingRef: { current: false },
    purgeSelection: {}, setIsPurgingDocuments() {},
    workspace: { id: 'test' }, workspaceName: 'test', selectedPath: '/Notes', selectedTreeName: 'context', selectedTreeType: 'context', documentsTotalCount: 5001,
    pane: { path: '/Notes', treeName: 'context' }, treeType: 'context',
    showProgress: toast => { notices.push(['start', toast]); return { done: toast => notices.push(['done', toast]), fail: toast => notices.push(['fail', toast]) } },
    window: { prompt: () => 'PURGE' },
    purgeWorkspaceDocuments: request, deleteWorkspaceDocuments: request, removeWorkspaceDocuments: request, destroyWorkspaceDocuments: request,
    setDocuments() {}, setDocumentsTotalCount() {}, invalidateDocumentCache() {}, fetchDocuments: async () => {}, refreshPane() {}, useCallback: fn => fn,
  }
  return { context, notices, requests }
}
for (const name of ['handlePurgeDocuments', 'handleRemoveDocument', 'handleDeleteDocument', 'handleRemoveDocuments', 'handleDeleteDocuments', 'handleDestroyDocuments', 'removeDocs', 'deleteDocs', 'destroyDocs']) {
  for (const fails of [false, true]) test(`${name}: pending notice precedes request and settles on ${fails ? 'failure' : 'success'}`, async () => {
    const { context, notices, requests } = progressContext()
    const action = handler(name, context)
    const task = action([1, 2])
    assert.equal(notices.length, 1)
    assert.equal(notices[0][0], 'start')
    assert.equal(requests.length, 1)
    if (fails) requests[0].reject(new Error('permission denied'))
    else requests[0].resolve({ requested: 5001, deleted: 5001, successful: [{ id: 1, docDeleted: true }], failed: [] })
    await task
    assert.equal(notices.length, 2)
    assert.equal(notices[1][0], fails ? 'fail' : 'done')
    if (fails) assert.match(notices[1][1].description, /permission denied/)
  })
}
test('cancelled purge sends no request and creates no progress notice', async () => {
  const { context, notices, requests } = progressContext()
  context.window.prompt = () => null
  await handler('handlePurgeDocuments', context)()
  assert.equal(notices.length, 0)
  assert.equal(requests.length, 0)
})
test('partial destroy is recorded as a failure rather than a completed operation', async () => {
  const { context, notices, requests } = progressContext()
  const task = handler('handleDestroyDocuments', context)([1, 2])
  requests[0].resolve({ successful: [{ id: 1, docDeleted: true }], failed: [{ id: 2, reason: 'denied' }] })
  await task
  assert.equal(notices[1][0], 'fail')
  assert.match(notices[1][1].description, /1 destroyed, 1 failed/)
})

const syncCode = ts.transpileModule(readFileSync(new URL('../src/services/backend-sync-progress.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
for (const outcome of ['complete', 'error', 'cancelled']) test(`resync notice follows accepted background work through ${outcome}`, async () => {
  const notices = [], timers = [], exports = {}, events = []
  let polls = 0, posts = 0
  const backend = { address: 'drive', driver: 'gdrive' }
  vm.runInNewContext(syncCode, { exports, require: () => ({
    syncBackend: async () => { posts++; return { started: true } },
    getBackend: async () => ++polls === 1 ? { ...backend, resyncing: true, progress: { scanned: 100, total: 5001 } }
      : { ...backend, resyncing: false, lastError: outcome === 'error' ? 'Scan incomplete' : null, resyncCancelledAt: outcome === 'cancelled' ? 'now' : null, progress: { scanned: 5001, total: 5001 } },
  }), setTimeout: fn => timers.push(fn), window: { dispatchEvent: event => events.push(event) }, CustomEvent })
  const showProgress = toast => { notices.push(['start', toast]); return { update: toast => notices.push(['update', toast]), done: toast => notices.push(['done', toast]), fail: toast => notices.push(['fail', toast]) } }
  const task = exports.syncBackendWithProgress(showProgress, 'test', 'gdrive', 'drive')
  assert.equal(task, exports.syncBackendWithProgress(showProgress, 'test', 'gdrive', 'drive'), 'repeated clicks share one scan')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(posts, 1)
  assert.deepEqual(notices.map(n => n[0]), ['start', 'update'])
  assert.match(notices[1][1].description, /100 \/ 5001/)
  timers.shift()()
  if (outcome === 'error') await assert.rejects(task, /Scan incomplete/)
  else await task
  assert.equal(notices.at(-1)[0], outcome === 'error' ? 'fail' : 'done')
  if (outcome === 'cancelled') assert.equal(notices.at(-1)[1].title, 'Resync stopped')
  assert.equal(events.length, outcome === 'error' ? 0 : 1)
})
