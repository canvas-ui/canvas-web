import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function loadHandler(path, name, dependencies) {
  const source = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let handler
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
      handler = ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(handler)
  const context = { ...dependencies }
  vm.runInNewContext(ts.transpileModule(`globalThis.run = ${handler.getText(source)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context)
  return context.run
}

for (const name of ['handlePasteDocuments', 'pasteDocuments']) {
  test(`${name}: Link to keeps the source even when the clipboard contains a cut`, async () => {
    const linked = [], removed = []
    const run = loadHandler('../src/pages/workspaces/[workspaceName]/index.tsx', name, {
      workspaceName: 'studio', selectedTreeName: 'context', selectedTreeType: 'context',
      pane: { treeName: 'context', path: '/Source' }, treeType: 'context',
      clipboard: { operation: 'cut', sourceTreeName: 'context', sourcePath: '/Source' },
      showProgress: () => ({ done() {}, fail(error) { throw new Error(JSON.stringify(error)) } }),
      pasteDocumentsToWorkspacePath: async (...args) => { linked.push(args); return true },
      removeWorkspaceDocuments: async (...args) => { removed.push(args); return true },
      treeTypeForName: () => 'context', invalidateDocumentCache() {}, setClipboard() {},
      fetchDocuments: async () => {}, fetchPaneDocuments: async () => {},
      window: { dispatchEvent() {} }, CustomEvent: class {}, performance, console: { info() {} },
    })
    assert.equal(await run('/Notes', [1], { move: false, targetTreeName: 'directory', targetTreeType: 'directory' }), true)
    assert.equal(linked[0][3], 'directory')
    assert.equal(linked[0][4], 'directory')
    assert.equal(removed.length, 0)
    assert.equal(await run('/Destination', [1]), true)
    assert.equal(removed.length, 1, 'ordinary paste still honors a cut')
  })
}

test('Link to from a live context uses the tree chosen in the picker', async () => {
  const linked = [], pasted = []
  const run = loadHandler('../src/pages/contexts/[contextId]/index.tsx', 'handlePasteDocuments', {
    context: { id: 'design', workspaceName: 'studio' }, isSharedContext: false, ownerId: undefined,
    showProgress: () => ({ done() {}, fail(error) { throw new Error(JSON.stringify(error)) } }),
    pasteDocumentsToWorkspacePath: async (...args) => { linked.push(args); return true },
    pasteDocumentsToContext: async (...args) => { pasted.push(args); return true },
    setCopiedDocuments() {}, fetchDocuments: async () => {},
  })
  assert.equal(await run('/Notes', [1], { move: false, targetTreeName: 'directory', targetTreeType: 'directory' }), true)
  assert.deepEqual(linked[0], ['studio', '/Notes', [1], 'directory', 'directory'])
  assert.equal(pasted.length, 0)
  assert.equal(await run('/Notes', [1]), true)
  assert.equal(pasted[0][0], 'design')
})
