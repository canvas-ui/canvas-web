import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function elements(value) {
  if (Array.isArray(value)) return value.flatMap(elements)
  return value && typeof value === 'object' ? [value, ...elements(value.props?.children)] : []
}

function setup(mode) {
  const slots = []; let cursor = 0; let mounted; let finish; let fail; let progress
  const calls = []; const downloads = []; let refreshed = 0
  const react = {
    useState(initial) {
      const i = cursor++; slots[i] ??= { value: initial }
      return [slots[i].value, value => { slots[i].value = value }]
    },
    useMemo: fn => fn(),
  }
  const jsx = (type, props) => ({ type, props })
  const exports = {}
  const modules = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-dom/client': { createRoot: () => ({ render: el => { mounted = el }, unmount() {} }) },
    'lucide-react': { RefreshCw: 'spinner' },
    '@/components/ui/alert-dialog': new Proxy({}, { get: (_, name) => name }),
    '@/components/ui/button': { Button: 'button' }, '@/components/ui/input': { Input: 'input' },
    '@/services/subtree': {
      startSubtreeExport: async (...args) => { calls.push(args); return { id: 'job', status: 'running', phase: 'folders' } },
      startSubtreeImport: async (...args) => { calls.push(args); return { id: 'job', status: 'running', phase: 'validating' } },
      waitForSubtreeJob: (...args) => { progress = args[3]; return new Promise((yes, no) => { finish = yes; fail = no }) },
    },
  }
  const source = readFileSync(new URL('../src/components/workspace/subtree-transfer-dialog.tsx', import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: name => { assert.ok(name in modules, name); return modules[name] },
    document: { body: { appendChild() {} }, createElement: type => type === 'a' ? { click() { downloads.push(this.download) } } : { remove() {} } },
    URL: { createObjectURL: () => 'blob:export', revokeObjectURL() {} }, Blob, setTimeout: fn => fn(),
  })
  exports.showSubtreeTransfer({ mode, workspaceId: 'prod', treeName: 'directory', path: '/Trips', onImported: () => { refreshed++ } })
  const render = () => { cursor = 0; return mounted.type(mounted.props) }
  const find = predicate => elements(render()).find(predicate)
  const button = label => find(el => el.type === 'button' && el.props.children === label)
  return { render, find, button, calls, downloads, refreshed: () => refreshed,
    finish: result => { const job = { id: 'job', status: 'done', phase: 'done', result }; progress(job); finish(job) },
    fail: error => fail(error),
  }
}

const archive = { format: 'canvas-subtree', version: 1, id: 'archive', source: { tree: { name: 'directory' } },
  nodes: [{ path: '', name: 'Cestovanie', documentIds: [10] }], documents: [{ id: 10 }, { id: 11 }], summary: { externalRelations: 0 } }

test('export defaults to related records, shows progress, then offers a Unicode-safe download', async () => {
  const ui = setup('export')
  assert.equal(ui.find(el => el.type === 'select').props.value, 'related')
  ui.button('Create export').props.onClick()
  await new Promise(setImmediate)
  assert.equal(ui.calls[0][3], 'related')
  assert.ok(ui.find(el => el.props?.role === 'status'))
  assert.equal(ui.button('Close').props.disabled, true)
  assert.equal(ui.button('Create export').props.disabled, true)
  ui.finish({ ...archive, nodes: [{ ...archive.nodes[0], name: 'Cestovanie Čína' }] })
  await new Promise(setImmediate)
  ui.button('Download export').props.onClick()
  assert.deepEqual(ui.downloads, ['Cestovanie_Čína.canvas-subtree.json'])
  assert.equal(ui.button('Close').props.disabled, false)
})

test('import resumes the same job after a polling failure and refreshes after completion', async () => {
  const ui = setup('import')
  ui.find(el => el.type === 'input' && el.props.type === 'file').props.onChange({ target: { files: [{ size: 1000, text: async () => JSON.stringify(archive) }] } })
  await new Promise(setImmediate)
  ui.button('Import subtree').props.onClick()
  await new Promise(setImmediate)
  assert.equal(ui.calls.length, 1)
  assert.equal(ui.calls[0][3], 'Cestovanie')
  ui.fail(new Error('Network disconnected'))
  await new Promise(setImmediate)
  assert.ok(ui.find(el => el.props?.role === 'alert'))
  assert.equal(ui.find(el => el.type === 'input' && el.props.type === 'file').props.disabled, true)
  ui.button('Retry').props.onClick()
  await new Promise(setImmediate)
  assert.equal(ui.calls.length, 1, 'retry polls the existing job, without a second import')
  ui.finish({ path: '/Trips/Cestovanie', documents: 2, reused: 1, unresolvedRelations: 0 })
  await new Promise(setImmediate)
  assert.equal(ui.refreshed(), 2, 'both partial-error state and completion refresh the tree')
  assert.equal(ui.button('Close').props.disabled, false)
  assert.equal(ui.button('Import subtree'), undefined)
})

test('export reports skipped IDs with inspection links and still permits downloading', async () => {
  const ui = setup('export')
  ui.button('Create export').props.onClick()
  await new Promise(setImmediate)
  ui.finish({ ...archive, skippedDocuments: [{ id: 101140, reason: 'not-found' }] })
  await new Promise(setImmediate)
  assert.match(JSON.stringify(ui.render()), /missing document/)
  const link = ui.find(el => el.type === 'a')
  assert.equal(link.props.href, '/workspaces/prod/documents/by-id/101140')
  assert.equal(link.props.target, '_blank')
  ui.button('Download export').props.onClick()
  assert.deepEqual(ui.downloads, ['Cestovanie.canvas-subtree.json'])
})

test('import displays source skipped IDs without linking them to unrelated destination IDs', async () => {
  const ui = setup('import')
  ui.find(el => el.type === 'input' && el.props.type === 'file').props.onChange({ target: { files: [{ size: 1000,
    text: async () => JSON.stringify({ ...archive, skippedDocuments: [{ id: 101140, reason: 'not-found' }] }),
  }] } })
  await new Promise(setImmediate)
  assert.match(JSON.stringify(ui.render()), /Source document 101140/)
  assert.equal(ui.find(el => el.type === 'a'), undefined)
  assert.equal(ui.button('Import subtree').props.disabled, false)
})
