import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const elements = value => Array.isArray(value) ? value.flatMap(elements)
  : value && typeof value === 'object' ? [value, ...elements(value.props?.children)] : []

function picker({ multiple = true, leaf = false, query = '' } = {}) {
  const slots = []
  let cursor = 0
  const selected = new Set()
  let selections = 0
  const opened = []
  const jsx = (type, props) => ({ type, props })
  const deps = {
    react: {
      useState(initial) {
        const index = cursor++
        slots[index] ??= { value: initial }
        return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }]
      },
      useRef(value) { const index = cursor++; return slots[index] ??= { current: value } },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/layer-style': { getLayerStyle: () => ({}) },
    '@/utils/color': { visibleAccentColor: () => undefined },
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
  }
  function load(file) {
    const exports = {}
    const { outputText } = ts.transpileModule(readFileSync(new URL(`../src/components/menu/shared/${file}.tsx`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    })
    vm.runInNewContext(outputText, { exports, require: name => deps[name] ?? {}, setTimeout, clearTimeout })
    return exports
  }
  deps['./tree-picker-utils'] = load('tree-picker-utils')
  const { LinkNode } = load('tree-picker-shared')
  const props = {
    node: { id: 'parent', name: 'Projects', children: leaf ? [] : [{ id: 'child', name: 'Mobile' }] },
    parentPath: '/', query, selected,
    onActivate: path => opened.push(path),
    onToggle(path) {
      selections++
      if (!multiple) { selected.clear(); selected.add(path) }
      else if (selected.has(path)) selected.delete(path)
      else selected.add(path)
    },
  }
  function render() { cursor = 0; return LinkNode(props) }
  const row = () => elements(render()).find(el => el.props?.title === '/Projects')
  const arrow = () => elements(render()).find(el => el.type === 'button')
  const event = (detail, extra = {}) => ({ detail, target: { closest: () => null }, preventDefault() {}, stopPropagation() {}, ...extra })
  return {
    selected, opened, row, arrow, selections: () => selections,
    expanded: () => arrow().props['aria-expanded'],
    click: () => row().props.onClick(event(1)),
    doubleClick(extra = {}) {
      row().props.onClick(event(1, extra))
      row().props.onClick(event(2, extra))
      row().props.onDoubleClick(event(2, extra))
    },
    doubleClickArrow() {
      arrow().props.onClick(event(1))
      arrow().props.onClick(event(2))
      row().props.onDoubleClick(event(2, { target: { closest: () => ({}) } }))
    },
  }
}

for (const multiple of [false, true]) {
  test(`${multiple ? 'multi' : 'single'} select picker expands a folder on double-click and selects once`, () => {
    const ui = picker({ multiple })
    ui.doubleClick()
    assert.equal(ui.expanded(), true)
    assert.equal(ui.selections(), 1)
    assert.ok(ui.selected.has('/Projects'))
    assert.deepEqual(ui.opened, [], 'branches expand before browsing their documents')
    ui.doubleClick()
    assert.equal(ui.expanded(), false)
  })
}

test('single-click selects without expansion; the arrow expands without changing selection', () => {
  const ui = picker()
  ui.click()
  assert.equal(ui.expanded(), false)
  ui.doubleClickArrow()
  assert.equal(ui.expanded(), true)
  assert.equal(ui.selections(), 1)
  assert.ok(ui.selected.has('/Projects'))
})

test('modifiers and leaf rows do not expand; search keeps matching children visible', () => {
  for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) {
    const ui = picker()
    ui.doubleClick({ [modifier]: true })
    assert.equal(ui.expanded(), false)
  }
  const leaf = picker({ leaf: true })
  leaf.doubleClick()
  assert.equal(leaf.expanded(), undefined)
  assert.equal(leaf.selections(), 1)
  assert.deepEqual(leaf.opened, ['/Projects'], 'leaf folders can open their document list')
  const search = picker({ query: 'mobile' })
  search.doubleClick()
  assert.equal(search.expanded(), true)
})
