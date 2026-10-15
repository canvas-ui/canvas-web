import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { backendTrashLocation } from '../src/lib/backend-trash.ts'
import { isSameDocumentFolder } from '../src/lib/document-drag.ts'

const serviceSource = ts.createSourceFile('workspace.ts', readFileSync(new URL('../src/services/workspace.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
const targetCode = ts.transpileModule(serviceSource.statements.filter(node => ts.isFunctionDeclaration(node) && ['matchBackendByTreePath', 'backendFolderTarget', 'backendRemovalTarget'].includes(node.name?.text)).map(node => node.getText(serviceSource)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const targets = { exports: {} }
vm.runInNewContext(targetCode, targets)

function children(element) {
  if (Array.isArray(element)) return element.flatMap(children)
  if (!element || typeof element !== 'object') return []
  return [element, ...children(element.props?.children)]
}

function setup() {
  const slots = []
  let cursor = 0
  const react = {
    useState(initial) {
      const i = cursor++
      slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next }]
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useEffect() {}, useCallback: fn => fn,
  }
  const jsx = (type, props) => ({ type, props })
  const alerts = [], requests = [], selected = []
  const dependencies = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'lucide-react': new Proxy({}, { get: (_, name) => name }),
    '@iconify/react': { Icon: 'icon' },
    '@/hooks/use-long-press-context-menu': {},
    '@/lib/utils': { cn: (...args) => args.filter(Boolean).join(' ') },
    '@/lib/backend-trash': { backendTrashLocation },
    '@/lib/document-drag': { isSameDocumentFolder },
    '@/lib/layer-style': {}, './LayerIconPicker': {},
    '@/components/common/context-menu-shell': { ContextMenuShell: 'menu' },
    '@/components/common/action-menu': {},
    '@/services/workspace': targets.exports, '@/lib/tree-style': { useTreeAccordion: () => false }, '@/utils/color': {},
  }
  const source = readFileSync(new URL('../src/components/menu/shared/MenuTreeView.tsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  vm.runInNewContext(compiled, {
    exports, require: name => { assert.ok(name in dependencies, name); return dependencies[name] },
    confirm: () => true, alert: message => alerts.push(message), setTimeout, clearTimeout,
  })
  const node = { id: 'mail', name: 'mail', label: 'Mail', children: [], locked: false }
  const props = {
    root: { name: '/', children: [node] }, treeName: 'backends', isBackendsTree: true, selectedPath: '/mail',
    onSelect: path => selected.push(path),
    onRemovePath: (...args) => new Promise((resolve, reject) => requests.push({ args, resolve, reject })),
  }
  const render = () => { cursor = 0; return exports.MenuTreeView(props) }
  const find = (element, predicate) => children(element).find(predicate)
  const card = view => find(view, element => element.type?.name === 'CardNode')
  const open = () => {
    card(render()).props.onCtxMenu({ preventDefault() {}, stopPropagation() {}, clientX: 10, clientY: 10 }, '/mail', node)
    return find(render(), element => element.type?.name === 'CtxMenu')
  }
  return { render, find, card, open, alerts, requests, selected, props }
}

test('virtual Trash exposes restore and rejects ordinary tree drag and drop', async () => {
  const ui = setup()
  const path = '/Trash/workspace%3Ahome'
  const node = { id: 'trash', name: 'workspace%3Ahome', children: [], locked: true, metadata: { backendTrash: true } }
  ui.props.root.children = [node]
  ui.props.selectedPath = path
  const restored = [], discarded = []
  ui.props.onRestoreTrash = async path => { restored.push(path) }
  ui.props.onDiscardTrash = async path => { discarded.push(path) }
  ui.card(ui.render()).props.onCtxMenu({ stopPropagation() {}, clientX: 1, clientY: 1 }, path, node)
  const menu = ui.find(ui.render(), element => element.type?.name === 'CtxMenu')
  const content = menu.type(menu.props)
  const buttons = children(content).filter(element => element.type === 'button')
  assert.equal(buttons.length, 3, 'Open Trash, Restore and Empty Trash are available')
  const restore = buttons.find(element => element.props.children?.includes('Restore original paths'))
  await restore.props.onClick()
  assert.deepEqual(restored, [path])
  await buttons.find(element => element.props.children?.includes('Empty Trash')).props.onClick()
  assert.deepEqual(discarded, [path])
  const event = { preventDefault() {}, stopPropagation() {}, dataTransfer: { getData() { assert.fail('Trash cannot accept ordinary drops') } } }
  await ui.card(ui.render()).props.onDrop(path, event)
  let prevented = false
  ui.card(ui.render()).props.onDragStart(path, { preventDefault() { prevented = true } })
  assert.equal(prevented, true)
})

for (const outcome of ['success', 'error']) {
  test(`backend deletion shows pending status, releases menu overlay, prevents duplicates and clears on ${outcome}`, async () => {
    const ui = setup()
    ui.props.onDeleteBackendFolder = ui.props.onRemovePath
    const menu = ui.open()
    menu.props.path = '/workspace/home/Photos'
    const remove = menu.props.onDeleteBackendFolder
    const content = menu.type(menu.props)
    const button = ui.find(content, element => element.type === 'button' && element.props.children?.includes('Delete from backend'))
    const running = button.props.onClick()
    let view = ui.render()
    assert.equal(ui.requests.length, 1)
    assert.deepEqual(Array.from(ui.requests[0].args), ['/workspace/home/Photos'])
    assert.ok(ui.find(view, element => element.props?.role === 'status'))
    assert.equal(ui.find(view, element => element.type?.name === 'CtxMenu'), undefined, 'overlay closes before request finishes')
    assert.equal(ui.card(view).props.removingPaths.get('/workspace/home/Photos'), 'Deleting from backend…')
    ui.card(view).props.onSelect('/other/sent')
    assert.deepEqual(ui.selected, ['/other/sent'], 'navigation remains available')
    assert.equal(await remove('/workspace/home/Photos'), false)
    assert.equal(await remove('/workspace/home/Photos/child'), false)
    assert.equal(ui.requests.length, 1)
    assert.equal(await remove('/workspace/home'), false, 'cannot remove a parent while its child is being deleted')
    if (outcome === 'success') ui.requests[0].resolve(true)
    else ui.requests[0].reject(new Error('Purge failed'))
    await running
    view = ui.render()
    assert.equal(ui.find(view, element => element.props?.role === 'status'), undefined)
    assert.equal(ui.card(view).props.removingPaths.size, 0)
    assert.equal(ui.alerts.length, outcome === 'error' ? 1 : 0)
    assert.equal(typeof ui.open().props.onDeleteBackendFolder, 'function', 'removal becomes available again')
  })
}

const buttons = menu => children(menu.type(menu.props)).filter(e => e.type === 'button')
const label = button => (button.props.children || []).filter(c => typeof c === 'string').join('')

test('backend menu exposes one physical deletion and no virtual layer operations', () => {
  const ui = setup()
  Object.assign(ui.props, { onDeleteBackendFolder: async () => true, onLockLayer: async () => true, onUnlockLayer: async () => true, onDestroyLayer: async () => true, onAddRule: () => {} })
  const menu = ui.open()
  menu.props.path = '/workspace/home/Photos'
  const labels = buttons(menu).map(label)
  assert.ok(labels.includes('Delete from backend'))
  assert.ok(labels.includes('Auto-Link documents to…'))
  for (const name of ['Remove', 'Remove recursive', 'Remove and purge documents', 'Remove, purge and destroy on backend', 'Lock layer', 'Unlock layer', 'Destroy layer', 'Sync folders into Directory']) assert.ok(!labels.includes(name), name)
  menu.props.node = { ...menu.props.node, locked: true }
  assert.ok(!buttons(menu).map(label).includes('Unlock layer'))
  menu.props.path = '/workspace/home'
  assert.ok(!buttons(menu).map(label).includes('Delete from backend'), 'backend root is not a folder deletion target')
})

for (const treeName of ['context', 'directory']) {
  test(`${treeName} removal retains the appropriate recursion semantics`, async () => {
    const ui = setup()
    Object.assign(ui.props, { treeName, isBackendsTree: false })
    const menu = ui.open()
    const entries = buttons(menu)
    assert.equal(entries.map(label).includes('Remove recursive'), treeName === 'context')
    const running = entries.find(b => label(b) === 'Remove').props.onClick()
    assert.equal(ui.requests[0].args[1], treeName === 'directory')
    ui.requests[0].resolve(true)
    await running
  })
}


test('Drive folder deletion is available only for writable descendants', () => {
  const ui = setup()
  ui.props.onDeleteBackendFolder = async () => true
  ui.props.backends = [{driver:'gdrive', address:'drive', enabled:true, treePath:'/gdrive/drive', capabilities:{mutableContainers:true}, config:{readOnly:false}}]
  const menu = ui.open()
  menu.props.path = '/gdrive/drive/Photos'
  assert.ok(buttons(menu).map(label).includes('Delete from backend'))
  menu.props.path = '/gdrive/drive'
  assert.ok(!buttons(menu).map(label).includes('Delete from backend'))
  menu.props.path = '/gdrive/drive/Photos'
  menu.props.backends[0].config.readOnly = true
  assert.ok(!buttons(menu).map(label).includes('Delete from backend'))
  menu.props.backends[0].config.readOnly = false
  menu.props.backends[0].enabled = false
  assert.ok(!buttons(menu).map(label).includes('Delete from backend'))
})
