import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { backendTrashLocation } from '../src/lib/backend-trash.ts'

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
    '@/lib/layer-style': {}, './LayerIconPicker': {},
    '@/components/common/context-menu-shell': { ContextMenuShell: 'menu' },
    '@/components/common/action-menu': {},
    '@/services/workspace': {}, '@/lib/tree-style': { useTreeAccordion: () => false }, '@/utils/color': {},
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
  const event = { preventDefault() {}, dataTransfer: { getData() { assert.fail('Trash cannot accept ordinary drops') } } }
  await ui.card(ui.render()).props.onDrop(path, event)
  let prevented = false
  ui.card(ui.render()).props.onDragStart(path, { preventDefault() { prevented = true } })
  assert.equal(prevented, true)
})

for (const outcome of ['success', 'error']) {
  test(`purge shows pending status, releases menu overlay, prevents duplicates and clears on ${outcome}`, async () => {
    const ui = setup()
    const menu = ui.open()
    const remove = menu.props.onRemove
    const content = menu.type(menu.props)
    const button = ui.find(content, element => element.type === 'button' && element.props.children?.includes('Remove and purge documents'))
    const running = button.props.onClick()
    let view = ui.render()
    assert.equal(ui.requests.length, 1)
    assert.deepEqual(Array.from(ui.requests[0].args), ['/mail', true, true, false])
    assert.ok(ui.find(view, element => element.props?.role === 'status'))
    assert.equal(ui.find(view, element => element.type?.name === 'CtxMenu'), undefined, 'overlay closes before request finishes')
    assert.equal(ui.card(view).props.removingPaths.get('/mail'), 'Removing and purging documents…')
    ui.card(view).props.onSelect('/other/sent')
    assert.deepEqual(ui.selected, ['/other/sent'], 'navigation remains available')
    assert.equal(await remove('/mail', true, true), false)
    assert.equal(await remove('/mail/child', true, true), false)
    assert.equal(ui.requests.length, 1)
    assert.equal(ui.open().props.onRemove, undefined, 'menu cannot repeat pending removal')
    if (outcome === 'success') ui.requests[0].resolve(true)
    else ui.requests[0].reject(new Error('Purge failed'))
    await running
    view = ui.render()
    assert.equal(ui.find(view, element => element.props?.role === 'status'), undefined)
    assert.equal(ui.card(view).props.removingPaths.size, 0)
    assert.equal(ui.alerts.length, outcome === 'error' ? 1 : 0)
    assert.equal(typeof ui.open().props.onRemove, 'function', 'removal becomes available again')
  })
}
