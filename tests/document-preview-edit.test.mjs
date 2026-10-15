import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load(path, dependencies, globals = {}) {
  const exports = {}
  const { outputText } = ts.transpileModule(readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  })
  vm.runInNewContext(outputText, { exports, require: name => dependencies[name] ?? {}, ...globals })
  return exports
}

const types = load('components/renderers/types.ts', {})
const display = load('lib/document-display.ts', { '@/components/renderers/types': types })
const textDocument = load('lib/text-document.ts', { '@/components/renderers/types': types, '@/lib/document-display': display })
const editable = load('components/object-card/editable-schema.ts', { '@/components/renderers/types': types, '@/lib/text-document': textDocument })
const elements = value => Array.isArray(value) ? value.flatMap(elements)
  : value && typeof value === 'object' ? [value, ...elements(value.props?.children)] : []

function setup(document, isPublic = false) {
  const slots = []
  const selection = { cleared: 0, removeAllRanges() { this.cleared++ } }
  let cursor = 0, changed = false
  const jsx = (type, props) => ({ type, props })
  class Element {
    constructor(interactive) { this.interactive = interactive }
    closest(selector) { return this.interactive && selector.includes(this.interactive) ? this : null }
  }
  const { ViewTab } = load('components/object-card/tabs.tsx', {
    react: {
      Suspense: 'suspense',
      useState(initial) {
        const index = cursor++
        slots[index] ??= { value: initial }
        return [slots[index].value, value => {
          slots[index].value = typeof value === 'function' ? value(slots[index].value) : value
          changed = true
        }]
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/renderers/types': types,
    '@/lib/text-document': textDocument,
    './editable-schema': editable,
    '@/components/renderers/public-share': { usePublicShareCode: () => isPublic ? 'share' : null },
    '@/hooks/useToastHelpers': { useToastHelpers: () => ({}) },
    '@/components/renderers/registry': { DocumentRenderer: 'preview' },
    './EditForm': { DocumentEditForm: 'form' },
    '@/components/editors/text-lazy': { LazyTextDocumentEditor: 'text-editor' },
    '@/components/editors/sketch-lazy': { LazySketchEditor: 'sketch-editor' },
  }, { Element })
  let props = { document, workspaceId: 'studio' }
  function render(next) {
    props = { ...props, ...next }
    let view
    do { cursor = 0; changed = false; view = ViewTab(props) } while (changed)
    return view
  }
  const find = type => elements(render()).find(el => el.type === type)
  return {
    find, render, selection,
    mouseDown({ detail = 1, button = 0, interactive } = {}) {
      let prevented = false
      elements(render()).find(el => el.props?.onMouseDownCapture).props.onMouseDownCapture({
        target: new Element(interactive), currentTarget: { contains: () => true }, detail, button,
        preventDefault() { prevented = true },
      })
      return prevented
    },
    doubleClick({ interactive, portal = false, prevented = false } = {}) {
      elements(render()).find(el => el.props?.onDoubleClickCapture).props.onDoubleClickCapture({
        target: new Element(interactive), currentTarget: { contains: () => !portal, ownerDocument: { getSelection: () => selection } }, defaultPrevented: prevented,
        preventDefault() {}, stopPropagation() {},
      })
    },
  }
}

for (const [name, document] of [
  ['note', { schema: types.NOTE_SCHEMA }],
  ['plain text', { schema: types.FILE_SCHEMA, metadata: { contentType: 'text/plain' } }],
  ['markdown file', { schema: types.FILE_SCHEMA, metadata: { contentType: 'text/markdown' } }],
  ['todo', { schema: types.TODO_SCHEMA }],
  ['sketch', { schema: types.DRAWING_SCHEMA }],
  ['link', { schema: types.LINK_SCHEMA }],
  ['identity', { schema: `${types.IDENTITY_SCHEMA}/person` }],
]) {
  test(`double-clicking a ${name} preview edits inside the current view and closing restores the preview`, () => {
    const ui = setup({ id: 42, ...document })
    ui.doubleClick()
    const opened = ui.find('form')
    assert.ok(opened)
    assert.equal(opened.props.workspaceId, 'studio')
    assert.equal(ui.find('text-editor'), undefined, 'double-click does not open an overlay')
    assert.equal(ui.find('sketch-editor'), undefined)
    assert.equal(ui.selection.cleared, 1, 'preview selection cannot spill into the replacement editor')
    opened.props.onClose()
    assert.ok(ui.find('preview'))
    assert.equal(ui.find('form'), undefined)
  })
}

test('preview editing leaves controls, links, portals and handled events alone', () => {
  const ui = setup({ id: 42, schema: types.NOTE_SCHEMA })
  for (const interactive of ['a', 'button', 'input', 'textarea', 'select', 'label', 'summary', '[role="button"]', '[role="checkbox"]', '[contenteditable]']) {
    ui.doubleClick({ interactive })
    assert.ok(ui.find('preview'), interactive)
  }
  for (const options of [{ portal: true }, { prevented: true }]) {
    ui.doubleClick(options)
    assert.ok(ui.find('preview'))
  }
})

test('only the editing double-click suppresses native text selection', () => {
  const ui = setup({ id: 42, schema: types.NOTE_SCHEMA })
  assert.equal(ui.mouseDown(), false, 'single-click and drag selection stay available')
  assert.equal(ui.mouseDown({ detail: 2 }), true)
  assert.equal(ui.mouseDown({ detail: 2, button: 2 }), false)
  for (const interactive of ['a', 'button', 'input', 'textarea', '[contenteditable]']) {
    assert.equal(ui.mouseDown({ detail: 2, interactive }), false, interactive)
  }
  const publicUi = setup({ id: 42, schema: types.NOTE_SCHEMA }, true)
  assert.equal(publicUi.mouseDown({ detail: 2 }), false)
  const binary = setup({ id: 42, schema: types.FILE_SCHEMA, metadata: { contentType: 'image/png' } })
  assert.equal(binary.mouseDown({ detail: 2 }), false)
})

test('public previews and documents without editable content do not open an editor', () => {
  for (const [document, isPublic] of [
    [{ schema: types.NOTE_SCHEMA }, true],
    [{ schema: types.FILE_SCHEMA, metadata: { contentType: 'image/png' } }, false],
    [{ schema: 'data/schema/message/email' }, false],
  ]) {
    const ui = setup({ id: 42, ...document }, isPublic)
    ui.doubleClick()
    assert.ok(ui.find('preview'))
    for (const editor of ['text-editor', 'sketch-editor', 'form']) assert.equal(ui.find(editor), undefined)
  }
})

test('changing documents or workspaces closes the previous content editor', () => {
  for (const schema of [types.NOTE_SCHEMA, types.DRAWING_SCHEMA, types.TODO_SCHEMA]) {
    for (const next of [{ document: { id: 43, schema } }, { workspaceId: 'other' }]) {
      const ui = setup({ id: 42, schema })
      ui.doubleClick()
      ui.render(next)
      assert.ok(ui.find('preview'))
      for (const editor of ['text-editor', 'sketch-editor', 'form']) assert.equal(ui.find(editor), undefined)
    }
  }
})
