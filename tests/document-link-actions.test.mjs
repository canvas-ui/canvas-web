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

for (const treeName of ['context', 'backends']) {
  test(`document menu in ${treeName} offers distinct backend, index and complete deletion`, async () => {
    const calls = []
    const dependencies = {
      treeName, documents: [1, 2].map(id => ({ id, schema: 'data/schema/file', data: {}, locations: [{ url: `stored://home/${id}` }] })),
      workspaceId: 'studio', bulkEditAllowed: false, canLink: false, canAddRelated: false, canUseBackends: true,
      openToSide: undefined, onCopyDocuments: undefined, onCutDocuments: undefined,
      removeDocument: undefined, removeDocuments: undefined,
      onDeleteDocument: id => calls.push(['index', id]), onDeleteDocuments: ids => calls.push(['index-many', ...ids]),
      onDestroyDocument: id => calls.push(['all', id]), onDestroyDocuments: ids => calls.push(['all-many', ...ids]),
      setBackendPanel: panel => calls.push(['backend', panel.mode, ...panel.ids]), setSelectedDocuments() {},
      canSaveToFolder: () => true, saveToFolder: ids => calls.push(['folder', ...ids]), downloadToDisk: ids => calls.push(['download', ...ids]),
      sendAccounts: { workspaceId: 'studio', accounts: [
        { driver: 'imap', address: 'office', from: 'office@example.com', canSend: true },
        { driver: 'whatsapp', address: 'phone', canSend: true },
      ] },
      FILE_SCHEMA: 'data/schema/file', MAX_SEND_FILES: 8, MESSAGE_DRIVER_LABELS: { imap: 'E-mail', whatsapp: 'WhatsApp' },
      getLocationFilename: doc => `invoice-${doc.id}.pdf`, getDocumentDisplayInfo: () => ({ title: '' }),
      setSendTo: send => calls.push(['send', send.account.driver, ...send.files.map(file => file.name)]),
    }
    for (const icon of ['Eye', 'Link', 'Download', 'FolderOpen', 'Trash2', 'HardDrive', 'ArrowRightLeft', 'Send', 'Mail', 'MessageCircle']) dependencies[icon] = icon
    const actions = loadHandler('../src/components/common/document-list.tsx', 'documentActions', dependencies)
    for (const ids of [[1], [1, 2]]) {
      const menu = actions(ids)
      const suffix = ids.length > 1 ? ' (2)' : ''
      const deletions = menu.filter(item => ['backend-delete', 'delete', 'destroy'].includes(item.id))
      assert.deepEqual(Array.from(deletions, item => item.label), [
        `Delete from backend…${suffix}`, `Delete from index${suffix}`, `Delete from index and all backends${suffix}`,
      ])
      const toDisk = menu.filter(item => ['save-to-folder', 'download'].includes(item.id))
      assert.deepEqual(Array.from(toDisk, item => item.label), [`Save to folder…${suffix}`, ids.length > 1 ? 'Download as zip (2)' : 'Download'])
      for (const action of [...toDisk, ...deletions]) await action.run()
      // Send to: one entry per sending account; WhatsApp carries a single file.
      const sendTo = menu.find(item => item.id === 'send-to')
      assert.equal(sendTo.label, `Send to${suffix}`)
      assert.deepEqual(Array.from(sendTo.children, item => [item.label, !!item.disabled]), [
        ['E-mail · via office@example.com', false], ['WhatsApp · via phone', ids.length > 1],
      ])
      await sendTo.children[0].run()
    }
    assert.deepEqual(calls, [
      ['folder', 1], ['download', 1], ['backend', 'delete', 1], ['index', 1], ['all', 1], ['send', 'imap', 'invoice-1.pdf'],
      ['folder', 1, 2], ['download', 1, 2], ['backend', 'delete', 1, 2], ['index-many', 1, 2], ['all-many', 1, 2], ['send', 'imap', 'invoice-1.pdf', 'invoice-2.pdf'],
    ])
  })
}
