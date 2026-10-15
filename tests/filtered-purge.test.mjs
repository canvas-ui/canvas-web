import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const read = (file, kind) => ts.createSourceFile(file, readFileSync(new URL('../' + file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, kind)
const service = read('src/services/workspace.ts', ts.ScriptKind.TS)
const page = read('src/pages/workspaces/[workspaceName]/index.tsx', ts.ScriptKind.TSX)
const plain = value => JSON.parse(JSON.stringify(value))
function evaluate(code, context) {
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context)
}
function expression(name) {
  let result
  function visit(n) {
    if (ts.isVariableDeclaration(n) && n.name.getText(page) === name) result = n.initializer.getText(page)
    ts.forEachChild(n, visit)
  }
  visit(page); assert.ok(result, name); return result
}
function setup() {
  const requests = [], notices = [], refreshes = []
  const context = {
    exports: {}, URLSearchParams, console, Error,
    API_ROUTES: { workspaces: '/workspaces' }, DEFAULT_WORKSPACE_TREE_NAME: 'context',
    isDocumentFieldSort: () => false,
    api: {
      getEnvelope: async url => { requests.push({ method: 'GET', url }); return { payload: [], totalCount: 501 } },
      post: async (url, body) => { requests.push({ method: 'POST', url, body: plain(body) }); return { requested: 501, deleted: 501 } },
      delete: () => assert.fail('unsafe DELETE must never be used'),
    },
    workspace: { id: 'test' }, workspaceName: 'test', selectedPath: '/Photos', selectedTreeName: 'context',
    treeTypeForName: name => name === 'directory' ? 'directory' : 'context', docScope: 'path',
    tbAllOf: ['data/mime/image'], viewAllOf: ['data/mime/image', 'data/schema/file'],
    tbAnyOf: ['tag/a', 'tag/b'], tbNoneOf: ['tag/keep'], tbScopeFilters: ['t:crud:created:today', 'geo:near:48,17,5m'],
    tbLensIds: null, serverSearchQueries: ['holiday', 'beach'], isLayerView: false, selectedLayerId: null,
    listedTotalCount: 501, documentsTotalCount: 999, isLoadingDocuments: false, isPurgingDocuments: false,
    loadedSelectionKey: '', sessionActive: false, geoSelection: null, purgePendingRef: { current: false },
    window: { prompt: text => { context.prompt = text; return 'PURGE' } },
    setIsPurgingDocuments: value => { context.isPurgingDocuments = value },
    invalidateDocumentCache: () => refreshes.push('invalidate'), fetchDocuments: async () => refreshes.push('refresh'),
    showProgress: toast => { notices.push(['start', toast]); return { done: toast => notices.push(['done', toast]), fail: toast => notices.push(['fail', toast]) } },
  }
  for (const name of ['appendRel', 'appendQueries', 'buildWorkspaceDocumentSelection', 'getWorkspaceDocuments', 'purgeWorkspaceDocuments']) {
    const fn = service.statements.find(n => ts.isFunctionDeclaration(n) && n.name.text === name)
    assert.ok(fn, name); evaluate(fn.getText(service).replace(/^export /, ''), context)
  }
  const update = () => {
    evaluate('globalThis.purgeSelection = ' + expression('purgeSelection'), context)
    evaluate('globalThis.purgeSelectionKey = ' + expression('purgeSelectionKey'), context)
    evaluate('globalThis.disablePurgeDocuments = ' + expression('disablePurgeDocuments'), context)
  }
  update(); context.loadedSelectionKey = context.purgeSelectionKey; update()
  evaluate('globalThis.purge = ' + expression('handlePurgeDocuments'), context)
  return { context, requests, notices, refreshes, update }
}

test('UI purge transmits all toolbox and tab filters, queries and the displayed all-pages count', async () => {
  const { context: c, requests, notices, refreshes } = setup()
  await c.purge()
  assert.equal(requests.length, 1)
  assert.equal(requests[0].method, 'POST')
  assert.equal(requests[0].body.expectedCount, 501)
  assert.deepEqual(requests[0].body.selection, {
    treeNameOrTreeId: 'context', treeType: 'context', context: '/Photos', scope: 'path',
    allOf: ['data/mime/image', 'data/schema/file'], anyOf: ['tag/a', 'tag/b'], noneOf: ['tag/keep'],
    filters: ['t:crud:created:today', 'geo:near:48,17,5m'], rel: [], q: ['holiday', 'beach'], applyCanvasSpec: true,
  })
  assert.match(c.prompt, /501.*across all pages/)
  assert.deepEqual(refreshes, ['invalidate', 'refresh'])
  assert.equal(notices.at(-1)[0], 'done')
})

test('list serialization and purge body carry identical membership constraints', async () => {
  const { context: c, requests } = setup()
  const options = { treeName: 'directory', treeType: 'directory', scope: 'workspace',
    anyOf: ['a', 'b'], noneOf: ['keep'], filters: ['geo:near:1,2,3m'], ids: [12, 30],
    queries: ['blue', ' sky '], rel: [{ p: 'mentions', of: 42, dir: 'in', op: 'noneOf' }], applyCanvasSpec: false }
  const selection = c.buildWorkspaceDocumentSelection('/Ignored', ['data/schema/file', 'data/mime/image'], options)
  await c.getWorkspaceDocuments('test', '/Ignored', ['data/schema/file', 'data/mime/image'], { ...options, limit: 200, page: 4 })
  await c.purgeWorkspaceDocuments('test', selection, 501)
  const params = new URL(requests[0].url, 'http://test').searchParams
  for (const [key, value] of Object.entries(requests[1].body.selection)) {
    assert.deepEqual(params.getAll(key), (Array.isArray(value) ? value : [value]).map(String), key)
  }
  assert.equal('page' in requests[1].body.selection, false)
  assert.equal('limit' in requests[1].body.selection, false)
})

for (const [label, change] of [
  ['new filters before results arrive', c => { c.viewAllOf = ['data/schema/note'] }],
  ['new path', c => { c.selectedPath = '/Other' }],
  ['new workspace', c => { c.workspaceName = 'other' }],
  ['loading', c => { c.isLoadingDocuments = true }],
  ['live session', c => { c.sessionActive = true }],
  ['browser map selection', c => { c.geoSelection = {} }],
]) test(`purge stays disabled for ${label}`, async () => {
  const { context, requests, update } = setup(); change(context); update()
  await context.purge(); assert.equal(requests.length, 0)
})

test('layer selection preserves its bitmap scope; whole workspace drops the layer', () => {
  const { context: c, update } = setup()
  c.isLayerView = true; c.selectedLayerId = 'layer-id'; update()
  assert.equal(c.purgeSelection.layerId, 'layer-id')
  c.docScope = 'workspace'; update()
  assert.equal(c.purgeSelection.layerId, undefined)
})

test('repeated purge clicks cannot submit two overlapping requests', async () => {
  const { context: c, requests } = setup()
  let finish
  c.api.post = () => { requests.push({}); return new Promise(resolve => { finish = resolve }) }
  const pending = c.purge(); await c.purge()
  assert.equal(requests.length, 1)
  finish({ requested: 501, deleted: 501 }); await pending
  assert.equal(c.purgePendingRef.current, false)
})

for (const kind of ['partial', 'conflict', 'old server']) test(`${kind} reports failure and refreshes, without an unsafe fallback`, async () => {
  const { context: c, requests, notices, refreshes } = setup()
  c.api.post = async () => { requests.push({});
    if (kind === 'partial') return { requested: 501, deleted: 100 }
    throw new Error(kind === 'conflict' ? 'Matching documents changed. Nothing was deleted.' : 'HTTP 404')
  }
  await c.purge()
  assert.equal(requests.length, 1)
  assert.equal(notices.at(-1)[0], 'fail')
  assert.deepEqual(refreshes, ['invalidate', 'refresh'])
  assert.equal(c.purgePendingRef.current, false)
})
