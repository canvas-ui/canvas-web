import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const transpile = (path, options = {}) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, ...options },
}).outputText

function harness(target) {
  const uploads = [], errors = [], slots = []
  let cursor = 0
  const jsx = (type, props) => ({ type, props })
  const deps = {
    react: { useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, v => { slots[i].value = v }] } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/toolbox/add/upload-manager': { uploadDroppedFiles: async (transfer, to) => { uploads.push({ files: transfer.files, to }); return transfer.files.length } },
    '@/components/toolbox/add/dropped-files': { isFileDrag: transfer => transfer.types.includes('Files') },
    '@/hooks/useToastHelpers': { useToastHelpers: () => ({ showErrorToast: text => errors.push(text) }) },
  }
  const exports = {}
  vm.runInNewContext(transpile('../src/components/canvas/FileDropArea.tsx'), { exports, require: name => deps[name] || {} })
  return { render(next = target) { cursor = 0; return exports.FileDropArea({ target: next, children: null }).props }, uploads, errors }
}
const event = (types, files = [], folder) => ({
  dataTransfer: { types, files }, prevented: false, stopped: false,
  target: { closest: () => (folder ? { dataset: { dropFolder: folder } } : null) },
  preventDefault() { this.prevented = true }, stopPropagation() { this.stopped = true },
})
const target = { mode: 'workspace', workspaceName: 'home', treeName: 'directory', treeType: 'directory', path: '/Accounting/Invoices' }
const files = [{ name: 'invoice.pdf' }, { name: 'photo.jpg' }]

test('OS drops upload at once into the folder in view, or into the folder entry under the pointer', async () => {
  const ui = harness(target), props = ui.render()
  const over = event(['Files'])
  props.onDragOverCapture(over)
  assert.equal(over.dataTransfer.dropEffect, 'copy')
  const drop = event(['Files'], files)
  props.onDropCapture(drop)
  assert.equal(drop.prevented, true)
  assert.equal(drop.stopped, true)
  assert.deepEqual(ui.uploads, [{ files, to: target }])
  ui.render().onDropCapture(event(['Files'], files, '/Accounting/Invoices/2026'))
  assert.equal(ui.uploads[1].to.path, '/Accounting/Invoices/2026')
  assert.equal(ui.uploads[1].to.treeName, 'directory')
})

test('internal document drags remain untouched and read-only canvases do not import', () => {
  for (const [to, types] of [[target, ['application/json']], [null, ['Files']]]) {
    const ui = harness(to), e = event(types, [{ name: 'photo.jpg' }])
    ui.render().onDragOverCapture(e)
    ui.render().onDropCapture(e)
    assert.equal(e.prevented, false)
    assert.equal(ui.uploads.length, 0)
  }
})

test('background uploads outlive their caller: batches run in order, report per file, and failures can be retried', async () => {
  const attempts = [], events = []
  const pipeline = async ({ target: to, items, patch }) => {
    attempts.push(to.path)
    for (const item of items().filter(entry => entry.status !== 'done')) {
      patch(item.id, item.file.name === 'broken.bin' && attempts.length < 3 ? { status: 'error', error: 'offline' } : { status: 'done', docId: 7 })
    }
  }
  const deps = {
    react: { useSyncExternalStore: (_subscribe, snapshot) => snapshot() },
    './useAddTarget': { resolveUploadWorkspace: async to => to, resolveBackendUpload: async () => null },
    './useFileFields': { buildFileDocument: () => ({}) },
    './dropped-files': {},
    './useUploadQueue': {
      itemKey: file => file.name, runUploadPipeline: pipeline,
      summarizeUpload: items => ({ done: items.filter(i => i.status === 'done').length, failed: items.filter(i => i.status === 'error').length, total: items.length, docIds: [] }),
    },
  }
  const exports = {}
  vm.runInNewContext(transpile('../src/components/toolbox/add/upload-manager.ts'), {
    exports, require: name => deps[name], window: { dispatchEvent: e => events.push(e) }, CustomEvent: class {}, setTimeout: () => 0, console, AbortController,
  })
  const settled = () => new Promise((resolve, reject) => {
    let turns = 0
    const poll = () => {
      if (exports.useUploadBatches().every(batch => batch.state === 'settled')) resolve()
      else if (++turns > 1000) reject(new Error(`uploads never settled: ${JSON.stringify(exports.useUploadBatches())}`))
      else setImmediate(poll)
    }
    poll()
  })
  let summary
  exports.enqueueUpload([{ name: 'a.txt' }, { name: 'a.txt' }], { ...target, path: '/A' }, { onSettled: value => { summary = value } })
  exports.enqueueUpload([{ name: 'broken.bin' }], { ...target, path: '/B' })
  assert.equal(exports.useUploadBatches().map(batch => batch.state).join(), 'waiting,waiting')
  await settled()
  assert.deepEqual(attempts, ['/A', '/B'])
  assert.equal(summary.done, 1, 'duplicate picks collapse to one file')
  const failed = exports.useUploadBatches().find(batch => batch.label.endsWith('/B'))
  assert.equal(failed.items[0].error, 'offline')
  exports.retryUploadBatch(failed.id)
  await settled()
  assert.equal(exports.useUploadBatches().find(batch => batch.id === failed.id).items[0].status, 'done')
  exports.dismissUploadBatch(failed.id)
  assert.equal(exports.useUploadBatches().some(batch => batch.id === failed.id), false)
})
