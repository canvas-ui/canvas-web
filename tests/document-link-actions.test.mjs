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

const service = readFileSync(new URL('../src/services/document-paste.ts', import.meta.url), 'utf8')
function loadPasteService(dependencies) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(service, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, require: () => dependencies, window: { dispatchEvent() {} }, CustomEvent: class {},
  })
  return exports.pasteDocuments
}

for (const name of ['handlePasteDocuments', 'pastePaneDocuments']) {
  test(`${name}: Link to keeps the source even when the clipboard contains a cut`, async () => {
    const linked = [], removed = []
    let clipboardCleared = 0
    const pasteDocuments = loadPasteService({
      BACKENDS_TREE_NAME: 'backends', treeTypeForName: () => 'context', imapFolderTarget: () => null,
      pasteDocumentsToWorkspacePath: async (...args) => { linked.push(args); return true },
      removeWorkspaceDocuments: async (...args) => { removed.push(args); return true },
    })
    const run = loadHandler('../src/pages/workspaces/[workspaceName]/index.tsx', name, {
      workspaceName: 'studio', selectedTreeName: 'context', selectedTreeType: 'context',
      pane: { treeName: 'context', path: '/Source' }, treeType: 'context',
      clipboard: { operation: 'cut', sourceTreeName: 'context', sourcePath: '/Source' },
      showProgress: () => ({ done() {}, fail(error) { throw new Error(JSON.stringify(error)) } }),
      pasteDocuments, invalidateDocumentCache() {}, setDocumentClipboard() { clipboardCleared++ },
      fetchDocuments: async () => {}, fetchPaneDocuments: async () => {},
    })
    assert.equal(await run('/Notes', [1], { move: false, targetTreeName: 'directory', targetTreeType: 'directory' }), true)
    assert.equal(linked[0][3], 'directory')
    assert.equal(linked[0][4], 'directory')
    assert.equal(removed.length, 0)
    assert.equal(clipboardCleared, 0, 'Link to leaves the clipboard alone')
    assert.equal(await run('/Destination', [1]), true)
    assert.equal(removed.length, 1, 'ordinary paste still honors a cut')
    assert.equal(removed[0][2], '/Source')
    assert.equal(clipboardCleared, 1, 'a clipboard paste consumes the clipboard')
  })
}

test('paste service: storage backend folders receive a copy or a move of the bytes; filing a backend file elsewhere keeps it', async () => {
  const transfers = [], removed = []
  const pasteDocuments = loadPasteService({
    BACKENDS_TREE_NAME: 'backends', treeTypeForName: () => 'directory', imapFolderTarget: () => null,
    listBackends: async () => [{ driver: 'file', address: 'workspace:home', kind: 'storage', enabled: true, config: {} }],
    backendTreeTarget: () => ({ driver: 'file', address: 'workspace:home', key: 'Invoices/2026' }),
    transferDocumentsToBackends: async (...args) => { transfers.push(args); return { successful: [{ id: 1 }], failed: [] } },
    pasteDocumentsToWorkspacePath: async () => true,
    removeWorkspaceDocuments: async (...args) => { removed.push(args); return true },
  })
  for (const move of [false, true]) {
    await pasteDocuments('studio', { treeName: 'backends', path: '/workspace/home/Invoices/2026' }, [1], { move, sourcePath: '/Inbox', sourceTreeName: 'directory' })
    const options = transfers.at(-1)[2]
    assert.equal(options.mode, move ? 'move' : 'copy')
    assert.equal(options.folder, 'Invoices/2026')
    assert.equal(options.to[0], 'workspace:home')
  }
  await pasteDocuments('studio', { treeName: 'directory', path: '/Filed' }, [1], { move: true, sourcePath: '/workspace/home/Invoices', sourceTreeName: 'backends' })
  assert.equal(removed.length, 0)
})

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
