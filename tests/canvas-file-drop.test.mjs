import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/canvas/FileDropArea.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
function harness(target) {
  const calls = [], errors = [], slots = []
  let cursor = 0, release
  const jsx = (type, props) => ({ type, props })
  const queue = {
    items: [], running: false,
    reset() { calls.push(['reset']) }, addFiles(files) { calls.push(['files', files]); queue.items = files.map(file => ({ file, status: 'queued' })) },
    start(to) { calls.push(['start', to]); return new Promise(resolve => { release = resolve }) },
  }
  const deps = {
    react: {
      useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, v => { slots[i].value = v }] },
      useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/toolbox/add/useUploadQueue': { useUploadQueue: () => queue },
    '@/hooks/useToastHelpers': { useToastHelpers: () => ({ showErrorToast: text => errors.push(text), showSuccessToast() {} }) },
  }
  const exports = {}
  vm.runInNewContext(compiled, { exports, require: name => deps[name] || {} })
  return {
    render(next = target) { cursor = 0; return exports.FileDropArea({ target: next, children: null }).props },
    calls, errors, finish() { release({ done: 1, failed: 0, total: 1 }) },
  }
}
const event = (types, files = []) => ({ dataTransfer: { types, files }, prevented: false, stopped: false,
  preventDefault() { this.prevented = true }, stopPropagation() { this.stopped = true } })
const target = { mode: 'workspace', workspaceName: 'home', treeName: 'directory', treeType: 'directory', path: '/Accounting/Invoices' }

test('OS drops await confirmation and keep the receiving canvas destination while navigation changes', async () => {
  const ui = harness(target), props = ui.render()
  const over = event(['Files'])
  props.onDragOverCapture(over)
  assert.equal(over.dataTransfer.dropEffect, 'copy')
  const files = [{ name: 'invoice.pdf' }, { name: 'photo.jpg' }]
  const drop = event(['Files'], files)
  props.onDropCapture(drop)
  assert.equal(drop.prevented, true)
  assert.equal(drop.stopped, true)
  assert.deepEqual(JSON.parse(JSON.stringify(ui.calls)), [['reset'], ['files', files]])
  const elements = value => Array.isArray(value) ? value.flatMap(elements)
    : value && typeof value === 'object' ? [value, ...elements(value.props?.children)] : []
  const dialog = ui.render({ ...target, path: '/Elsewhere' })
  const confirm = elements(dialog.children).find(el => el.type === 'button' && el.props.children === 'Import files')
  assert.ok(confirm, 'drop opens import confirmation')
  confirm.props.onClick()
  assert.equal(ui.calls.at(-1)[1], target, 'confirmation uses drop-time destination')
  ui.render({ ...target, path: '/Elsewhere' }).onDropCapture(event(['Files'], files))
  assert.equal(ui.calls.filter(call => call[0] === 'start').length, 1)
  assert.equal(ui.errors.length, 1)
  ui.finish()
  await new Promise(resolve => setImmediate(resolve))
})

test('internal document drags remain untouched and read-only canvases do not import', () => {
  for (const [to, types] of [[target, ['application/json']], [null, ['Files']]]) {
    const ui = harness(to), e = event(types, [{ name: 'photo.jpg' }])
    ui.render().onDragOverCapture(e)
    ui.render().onDropCapture(e)
    assert.equal(e.prevented, false)
    assert.equal(ui.calls.length, 0)
  }
})
