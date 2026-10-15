import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { isSameDocumentFolder } from '../src/lib/document-drag.ts'

function loadHandler(path, name, dependencies) {
  const source = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let handler
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) handler = node
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
      handler = ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(handler, name)
  const context = { ...dependencies }
  vm.runInNewContext(ts.transpileModule(`globalThis.run = ${handler.getText(source)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context)
  return context.run
}

const source = { type: 'document', documentIds: [1, 2], sourceWorkspaceId: 'studio', sourceTreeName: 'directory', sourcePath: '/Notes' }

function setup(surface, target = {}) {
  const calls = [], feedback = []
  let cleared = false
  const workspaceId = target.workspaceId ?? 'studio', treeName = target.treeName ?? 'directory', path = target.path ?? '/Notes'
  const paste = async (...args) => { calls.push(args); return true }
  const dependencies = {
    isSameDocumentFolder, workspaceId, treeName, contextPath: path, onPasteDocuments: paste,
    setIsDragOver: value => feedback.push(value), setSelectedDocuments: () => { cleared = true },
    useState: () => [false, value => feedback.push(value)],
    backendTrashLocation: () => null, draggedPathRef: {}, isCopyRef: {}, setIsCopyDrag() {}, setDragOverPath: value => feedback.push(value),
  }
  let run
  if (surface === 'folder') {
    const hook = loadHandler('../src/components/common/document-list.tsx', 'useFolderDrop', dependencies)
    run = hook({ path }, paste, '/', treeName, workspaceId).onDrop
  } else if (surface === 'tree') {
    const handler = loadHandler('../src/components/menu/shared/MenuTreeView.tsx', 'handleDrop', dependencies)
    run = event => handler(path, event)
  } else run = loadHandler('../src/components/common/document-list.tsx', 'handleDrop', dependencies)
  return {
    calls, feedback, cleared: () => cleared,
    async drop(payload = source, shiftKey = false) {
      let stopped = false, prevented = false
      await run({
        shiftKey,
        dataTransfer: { types: ['application/json'], getData: () => JSON.stringify(payload) },
        preventDefault() { prevented = true }, stopPropagation() { stopped = true },
      })
      return { stopped, prevented }
    },
  }
}

for (const surface of ['list', 'folder', 'tree']) {
  test(`${surface}: same-folder drops perform no paste or move and preserve selection`, async () => {
    for (const path of ['/Notes', 'Notes/', '/Notes//']) for (const shift of [false, true]) {
      const ui = setup(surface, { path })
      assert.deepEqual(await ui.drop(source, shift), { stopped: true, prevented: true })
      assert.equal(ui.calls.length, 0, 'no backend work')
      assert.equal(ui.cleared(), false, 'the original selection remains')
      assert.ok(ui.feedback.length, 'drag highlighting is cleared')
    }
  })

  test(`${surface}: a different folder, tree or workspace still accepts documents`, async () => {
    for (const target of [{ path: '/Other' }, { treeName: 'context' }, { workspaceId: 'other' }]) {
      const ui = setup(surface, target)
      assert.deepEqual(await ui.drop(), { stopped: true, prevented: true })
      assert.equal(ui.calls.length, 1)
      assert.equal(ui.calls[0][0], target.path ?? '/Notes')
      assert.deepEqual(Array.from(ui.calls[0][1]), [1, 2])
    }
  })
}

test('unknown origins and similarly named folders are not treated as the same folder', () => {
  for (const payload of [{}, { ...source, sourcePath: undefined }, { ...source, sourceWorkspaceId: undefined }, { ...source, sourceTreeName: undefined }]) {
    assert.equal(isSameDocumentFolder(payload, 'studio', 'directory', '/Notes'), false)
  }
  assert.equal(isSameDocumentFolder(source, 'studio', 'directory', '/Notes/Child'), false)
  assert.equal(isSameDocumentFolder(source, 'studio', 'directory', '/notes'), false)
  assert.equal(isSameDocumentFolder({ ...source, sourcePath: '/' }, 'studio', 'directory', ''), true)
})

test('document drags carry their folder scope, but workspace-wide results do not claim a source folder', () => {
  for (const scope of ['path', 'workspace']) {
    let payload
    const handler = loadHandler('../src/components/common/document-list.tsx', 'handleMultiDragStart', {
      selectedDocuments: new Set([1, 2]), setSelectedDocuments() {}, contextPath: '/Notes', treeName: 'directory', workspaceId: 'studio', scope,
    })
    handler({ dataTransfer: { setData: (_, raw) => { payload = JSON.parse(raw) }, setDragImage() {} } }, 1)
    assert.deepEqual(payload.documentIds, [1, 2])
    assert.equal(payload.sourceWorkspaceId, 'studio')
    assert.equal(payload.sourceTreeName, 'directory')
    assert.equal(payload.sourcePath, scope === 'path' ? '/Notes' : undefined)
  }
})
