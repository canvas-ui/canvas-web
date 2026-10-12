import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { documentRefreshScope, eventTouchesView } from '../src/lib/document-event-scope.ts'

const source = ts.createSourceFile('workspace.tsx', readFileSync(new URL('../src/pages/workspaces/[workspaceName]/index.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const names = ['paneKey', 'documentKey', 'invalidateDocumentCache', 'invalidateCacheForEvent', 'invalidateRefreshTarget']
const functions = source.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(source)).join('\n')
const handlers = {}
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['onDocumentsRefresh', 'onRefresh'].includes(node.name.getText(source))) handlers[node.name.getText(source)] = node.initializer.getText(source)
  ts.forEachChild(node, visit)
}
visit(source)

function fixture() {
  const cache = new Map()
  const calls = []
  const context = {
    documentCache: cache, documentRefreshScope, eventTouchesView,
    treeTypeForName: name => ['directory', 'backends'].includes(name) ? 'directory' : 'context',
    workspaceName: 'home', selectedTreeName: 'context', selectedPath: '/Apps', docScope: 'path',
    pane: { treeName: 'context', path: '/Apps' }, sessionActiveRef: { current: false },
    fetchDocuments: () => calls.push('fetch'), resyncSession: () => calls.push('resync'), fetchPaneDocuments: () => calls.push('side'),
  }
  vm.runInNewContext(ts.transpileModule(`${functions}\nglobalThis.key = documentKey; globalThis.main = ${handlers.onDocumentsRefresh}; globalThis.side = ${handlers.onRefresh};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context)
  const key = (tree, path, workspace = 'home', scope = 'path') => context.key(workspace, tree, path, 1, 50, '', '', '', scope)
  const add = (tree, path, workspace, scope) => { const id = key(tree, path, workspace, scope); cache.set(id, { documents: [], totalCount: 0 }); return id }
  return { cache, calls, context, add, event: { detail: { workspaceName: 'home', treeName: 'context', path: '/Edu/Astronomy/Apps' } } }
}

test('import evicts previously empty shared-layer caches before navigating to /Apps', () => {
  const f = fixture()
  const shared = [f.add('context', '/Apps'), f.add('context', '/Other/Apps'), f.add('context', '/Edu'), f.add('context', '/', 'home', 'workspace')]
  const unrelated = [f.add('context', '/Unrelated'), f.add('directory', '/Apps'), f.add('context', '/Apps', 'other')]
  f.context.main(f.event)
  shared.forEach(key => assert.equal(f.cache.has(key), false, key))
  unrelated.forEach(key => assert.equal(f.cache.has(key), true, key))
  assert.deepEqual(f.calls, ['fetch'])
})

test('explicit refresh resyncs a live query and updates a split pane sharing that layer', () => {
  const f = fixture()
  f.context.sessionActiveRef.current = true
  f.context.main(f.event)
  f.context.side(f.event)
  assert.deepEqual(f.calls, ['resync', 'side'])
  f.context.main({ detail: { ...f.event.detail, path: '/Unrelated' } })
  f.context.side({ detail: { ...f.event.detail, workspaceName: 'other' } })
  assert.deepEqual(f.calls, ['resync', 'side'])
})
