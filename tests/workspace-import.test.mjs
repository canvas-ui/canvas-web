import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load(file, modules, globals = {}) {
  const exports = {}
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: name => { assert.ok(name in modules, name); return modules[name] }, Error, URLSearchParams, ...globals,
  })
  return exports
}

function elements(value) {
  if (Array.isArray(value)) return value.flatMap(elements)
  return value && typeof value === 'object' ? [value, ...elements(value.props?.children)] : []
}

const emptyScan = { discovered: [], adopted: [], updated: [], skipped: [], missing: [] }

function setupForm({ deferScan = false } = {}) {
  const slots = []; let cursor = 0; let finish; let fail
  const effects = []; const scans = []
  const calls = []; const events = []; const imported = []
  const react = {
    useState(initial) {
      const i = cursor++; slots[i] ??= { value: initial }
      return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value }]
    },
    useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i] },
    useEffect(effect, deps) {
      const i = cursor++
      if (slots[i]?.deps.every((value, index) => value === deps[index])) return
      effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, effect, cleanup: effect() } })
    },
  }
  const jsx = (type, props) => typeof type === 'function' ? type(props) : ({ type, props })
  const run = source => (...args) => { calls.push({ source, args }); return new Promise((yes, no) => { finish = yes; fail = no }) }
  const module = load('../src/components/workspace/workspace-import-form.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'lucide-react': { RefreshCw: 'spinner', Upload: 'upload-icon' },
    'react-router-dom': { Link: 'link' },
    '@/components/ui/button': { Button: 'button' }, '@/components/ui/input': { Input: 'input' },
    '@/services/workspace': {
      importWorkspaceFromFile: run('upload'), importWorkspaceFromPath: run('path'), IMPORT_PHASE_LABELS: { extracting: 'Extracting…' },
      scanWorkspaceFolders: () => new Promise((resolve, reject) => { scans.push({ resolve, reject }); if (!deferScan) resolve(emptyScan) }),
    },
  }, { window: { dispatchEvent: event => events.push(event.type) }, CustomEvent: class { constructor(type) { this.type = type } } })
  const render = () => {
    cursor = 0
    const result = module.WorkspaceImportForm({ onImported: ws => imported.push(ws) })
    effects.splice(0).forEach(effect => effect())
    return result
  }
  const find = predicate => elements(render()).find(predicate)
  const field = placeholder => find(el => el.type === 'input' && el.props.placeholder === placeholder)
  const identity = () => {
    field('my-workspace').props.onChange({ target: { value: 'travel' } })
    field('My Workspace').props.onChange({ target: { value: 'Cestovanie' } })
  }
  const replayEffects = () => { slots.filter(slot => slot.effect).forEach(slot => { slot.cleanup?.(); slot.cleanup = slot.effect() }) }
  return { render, find, field, identity, calls, events, imported, scans, replayEffects, finish: ws => finish(ws), fail: error => fail(error) }
}

test('upload waits for the chosen name and label, reports progress, then refreshes workspaces', async () => {
  const ui = setupForm()
  const file = { name: 'demo.tar.gz' }
  ui.find(el => el.props?.type === 'file').props.onChange({ target: { files: [file] } })
  assert.equal(ui.calls.length, 0)
  assert.equal(ui.find(el => el.type === 'button' && el.props.type === 'submit').props.disabled, true)
  ui.identity()
  ui.render().props.onSubmit({ preventDefault() {} })
  assert.equal(ui.calls[0].source, 'upload')
  assert.equal(ui.calls[0].args[0], file)
  assert.equal(ui.calls[0].args[3].name, 'travel')
  assert.equal(ui.calls[0].args[3].label, 'Cestovanie')
  ui.calls[0].args[1](0.5)
  assert.ok(ui.find(el => el.props?.role === 'status' && el.props.children === 'Uploading… 50%'))
  assert.equal(ui.find(el => el.type === 'button' && el.props.type === 'submit').props.disabled, true)
  ui.finish({ id: 'new', name: 'travel' })
  await new Promise(setImmediate)
  assert.deepEqual(ui.events, ['workspaces:refresh'])
  assert.equal(ui.imported[0].id, 'new')
});

test('server-path import passes an absolute path and shows job errors', async () => {
  const ui = setupForm()
  ui.find(el => el.type === 'select').props.onChange({ target: { value: 'path' } })
  ui.field('/tmp/workspace.tar.gz').props.onChange({ target: { value: '/tmp/demo.tar.gz' } })
  ui.identity()
  ui.render().props.onSubmit({ preventDefault() {} })
  assert.equal(ui.calls[0].source, 'path')
  assert.equal(ui.calls[0].args[0], '/tmp/demo.tar.gz')
  assert.equal(ui.calls[0].args[1].name, 'travel')
  ui.calls[0].args[2]({ phase: 'extracting' })
  assert.ok(ui.find(el => el.props?.role === 'status' && el.props.children === 'Extracting…'))
  ui.fail(new Error('Workspace name already exists'))
  await new Promise(setImmediate)
  assert.equal(ui.find(el => el.props?.role === 'alert').props.children, 'Workspace name already exists')
  assert.equal(ui.events.length, 0)
  assert.equal(ui.find(el => el.type === 'button' && el.props.type === 'submit').props.disabled, false)
});

test('opening import scans once even when effects replay and shows discovered workspaces', async () => {
  const ui = setupForm({ deferScan: true })
  ui.render()
  ui.replayEffects()
  assert.equal(ui.scans.length, 1)
  assert.equal(ui.find(el => el.type === 'button' && el.props.type === 'button').props.disabled, true)
  ui.scans[0].resolve({ ...emptyScan, adopted: [{ id: 'photos', name: 'photos', label: 'My Photos', dir: '/home/me/Workspaces/photos' }] })
  await new Promise(setImmediate)
  const link = ui.find(el => el.type === 'link')
  assert.equal(link.props.children, 'My Photos')
  assert.equal(link.props.to, '/workspaces/photos')
  assert.ok(ui.find(el => el.props?.role === 'status' && el.props.children === 'Found 1 workspace. Added to your workspace list.'))
  assert.deepEqual(ui.events, ['workspaces:refresh'])
  assert.equal(ui.imported.length, 0, 'discovery keeps the dialog open so results are visible')
  ui.render()
  assert.equal(ui.scans.length, 1, 'ordinary renders do not rescan')
});

test('Rescan finds another folder and keeps earlier discoveries visible without duplicates', async () => {
  const ui = setupForm({ deferScan: true })
  ui.render()
  const first = { id: 'photos', name: 'photos', dir: '/Workspaces/photos' }
  ui.scans[0].resolve({ ...emptyScan, discovered: [first] })
  await new Promise(setImmediate)
  ui.find(el => el.type === 'button' && el.props.type === 'button').props.onClick()
  ui.render()
  assert.equal(ui.scans.length, 2)
  ui.scans[1].resolve({ ...emptyScan, discovered: [first, { id: 'travel', name: 'travel', dir: '/Workspaces/travel' }] })
  await new Promise(setImmediate)
  assert.equal(elements(ui.render()).filter(el => el.type === 'link').length, 2)
  assert.ok(ui.find(el => el.props?.role === 'status' && el.props.children === 'Found 2 workspaces. Added to your workspace list.'))
});

test('scan failures can be retried and skipped folders are explained', async () => {
  const ui = setupForm({ deferScan: true })
  ui.render()
  ui.scans[0].reject(new Error('Server unavailable'))
  await new Promise(setImmediate)
  assert.equal(ui.find(el => el.props?.role === 'alert').props.children, 'Server unavailable')
  const rescan = ui.find(el => el.type === 'button' && el.props.type === 'button')
  assert.equal(rescan.props.disabled, false)
  rescan.props.onClick()
  ui.render()
  ui.scans[1].resolve({ ...emptyScan, skipped: [{ dir: '/Workspaces/incomplete', reason: 'missing id' }] })
  await new Promise(setImmediate)
  assert.ok(ui.find(el => el.type === 'details'))
  assert.ok(ui.find(el => el.props?.role === 'status' && el.props.children === 'No new workspace folders found.'))
  assert.equal(ui.find(el => el.props?.role === 'alert'), undefined)
});

test('import transport uses the configured API URL once and waits for archive jobs', async () => {
  const requests = []; const root = 'https://canvas.example/rest/v2/workspaces'
  const workspace = { id: 'imported', name: 'travel' }
  const module = load('../src/services/workspace.ts', {
    '@/lib/document-sort': {}, '@/components/workspace/workspace-start-dialog': {}, '@/lib/remote-mirror': {},
    '@/config/api': { API_ROUTES: { workspaces: root }, API_URL: 'https://canvas.example/rest/v2' },
    '@/lib/api': { api: {
      post: async (url, body) => { requests.push({ url, body }); return { id: 'job', phase: 'extracting' } },
      get: async url => { requests.push({ url }); return { id: 'job', status: 'done', phase: 'done', result: workspace } },
    } },
  }, {
    localStorage: { getItem: () => 'token' },
    XMLHttpRequest: class {
      upload = {}
      open(_method, url) { requests.push({ url }) }
      setRequestHeader() {}
      send() { this.status = 202; this.responseText = JSON.stringify({ payload: { job: { id: 'job' } } }); this.onload() }
    },
  })
  const presentation = { name: 'travel', label: 'Cestovanie Čína' }
  assert.equal(await module.importWorkspaceFromFile({ name: 'demo.tar.gz' }, undefined, undefined, presentation), workspace)
  const upload = new URL(requests[0].url)
  assert.equal(upload.pathname, '/rest/v2/workspaces/import/upload')
  assert.equal(upload.searchParams.get('name'), 'travel')
  assert.equal(upload.searchParams.get('label'), presentation.label)
  assert.equal(await module.importWorkspaceFromPath('/tmp/demo.tar.gz', presentation), workspace)
  const request = requests.find(item => item.body?.path)
  assert.equal(request.url, `${root}/import`)
  assert.equal(request.body.label, presentation.label)
  assert.equal(await module.importWorkspaceFromExport('stored.tar.gz', presentation), workspace)
  await module.scanWorkspaceFolders()
  assert.equal(requests.at(-1).url, `${root}/scan`)
});
