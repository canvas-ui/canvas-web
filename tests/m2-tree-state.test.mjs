import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText

test('tab buttons and keyboard cycling restore independent tree navigation', () => {
  const source = ts.createSourceFile('menu.tsx', read('components/menu/workspaces/WorkspaceM2.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const callbacks = {}
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ['handleTabChange', 'cycleTab'].includes(node.name.getText(source))) callbacks[node.name.getText(source)] = node.initializer.arguments[0].getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  const state = {}
  const context = {
    treeViews: {
      context: { selectedPath: '/Projects/Canvas/Screenshot', contentPath: null, searchQuery: 'Canvas' },
      directory: { selectedPath: '/Accounting/Invoices', contentPath: null, searchQuery: '' },
    },
    tabOrder: ['context', 'directory'], activeTab: 'context',
    cycleTree: (order, active, direction) => order[(order.indexOf(active) + direction + order.length) % order.length],
    setTabTouched() {}, setActiveTab(value) { state.tab = value; context.activeTab = value },
    setSelectedPath(value) { state.path = value }, setContentPath(value) { state.content = value }, setSearchQuery(value) { state.search = value },
  }
  for (const [name, body] of Object.entries(callbacks)) vm.runInNewContext(compile(`globalThis.${name} = ${body}`), context)
  context.cycleTab(1)
  assert.equal(state.path, '/Accounting/Invoices')
  context.cycleTab(-1)
  assert.equal(state.path, '/Projects/Canvas/Screenshot')
  assert.equal(state.search, 'Canvas')
  context.handleTabChange('directory')
  assert.equal(state.path, '/Accounting/Invoices')
})

test('expanded and explicitly collapsed branches survive a tree remount by node UUID', () => {
  const source = read('components/menu/shared/MenuTreeView.tsx') + '\nexport { CardNode };'
  const memory = new Map([['projects', false]])
  let slots = [], cursor = 0
  const jsx = (type, props) => ({ type, props })
  const deps = {
    react: {
      useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next }] },
      useEffect(fn) { fn() },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/hooks/use-long-press-context-menu': { useLongPressContextMenu: () => ({}) },
    '@/lib/layer-style': { getLayerStyle: () => ({}) },
    '@/lib/utils': { cn: () => '' },
    '@/utils/color': { onAccentTextClass: () => '', onAccentSolidTextClass: () => '' },
  }
  const exports = {}
  vm.runInNewContext(compile(source), { exports, require: name => deps[name] || {} })
  const props = {
    node: { id: 'projects', name: 'Projects', children: [{ id: 'canvas', name: 'Canvas' }] },
    parentPath: '/', depth: 0, selectedPath: '/Projects/Canvas', selectedPaths: new Set(),
    targetLayers: new Map(), styleOverrides: new Map(), removingPaths: new Map(), searchQuery: '', expansionState: memory,
  }
  const render = () => { cursor = 0; return exports.CardNode(props) }
  const elements = value => Array.isArray(value) ? value.flatMap(elements) : value && typeof value === 'object' ? [value, ...elements(value.props?.children)] : []
  const arrow = () => elements(render()).find(el => el.type === 'button' && 'aria-expanded' in el.props)
  assert.equal(arrow().props['aria-expanded'], false)
  arrow().props.onClick({ stopPropagation() {} })
  render()
  slots = []
  assert.equal(arrow().props['aria-expanded'], true)
  arrow().props.onClick({ stopPropagation() {} })
  render()
  slots = []
  assert.equal(arrow().props['aria-expanded'], false)
})
