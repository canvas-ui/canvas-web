import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText
const types = {}
vm.runInNewContext(compile(readFileSync(new URL('../src/components/renderers/types.ts', import.meta.url), 'utf8')), { exports: types })
const display = {}
vm.runInNewContext(compile(readFileSync(new URL('../src/lib/document-display.ts', import.meta.url), 'utf8')), {
  exports: display, URL, require: () => types,
})
const { getDocumentDisplayInfo } = display
const doc = (schema, data = {}, extra = {}) => ({ id: 42, schema: `data/schema/${schema}`, data, ...extra })
const fixtures = [
  [doc('file', {}, { metadata: { filename: 'Renamed.pdf' }, locations: [{ url: 'file://laptop/old.pdf' }] }), 'Renamed.pdf'],
  [doc('file', {}, { locations: [{ url: 'file://laptop/old.pdf' }, { url: 'stored://workspace:data/abcdef0123456789', metadata: { filename: 'Budget: Q4.pdf' } }] }), 'Budget: Q4.pdf'],
  [doc('file', {}, { locations: [{ url: 'stored://workspace:home/photos/my%20photo.jpg' }] }), 'my photo.jpg'],
  [doc('file', { filename: 'Report.txt' }), 'Report.txt'],
  [doc('file', { title: 'Scanned report' }), 'Scanned report'],
  [doc('note', { title: 'Meeting notes' }), 'Meeting notes'],
  [doc('tab', { title: 'Reference page', url: 'https://example.com/reference' }), 'Reference page'],
  [doc('link', { label: 'Project website', uri: 'https://example.com/project' }), 'Project website'],
  [doc('link', { uri: 'https://example.com/project' }), 'example.com/project'],
  [doc('tab', { url: 'https://example.com/reference' }), 'example.com/reference'],
  [doc('message/email', { subject: 'Quarterly update' }), 'Quarterly update'],
]

test('document labels use filenames, note titles, link labels and URL fallbacks', () => {
  for (const [document, expected] of fixtures) {
    assert.equal(getDocumentDisplayInfo(document).title, expected)
  }
})

test('adding or reordering mirror locations does not change the displayed filename', () => {
  const document = fixtures[1][0]
  assert.equal(getDocumentDisplayInfo({ ...document, locations: [...document.locations].reverse() }).title, 'Budget: Q4.pdf')
})

test('relation links and their tooltips render the human label in both directions', () => {
  const source = ts.createSourceFile('RelationsSection.tsx', readFileSync(new URL('../src/components/object-card/RelationsSection.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const row = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'RelationRow')
  const jsx = (type, props) => ({ type, props })
  const context = {
    exports: {}, getDocumentDisplayInfo,
    useDocumentModal: () => ({}), useSideView: () => ({}), useCanvasRow: () => null,
    useState: initial => [initial, () => {}], useToastHelpers: () => ({}),
    ArrowRight: 'ArrowRight', ArrowLeft: 'ArrowLeft', DocumentIcon: 'DocumentIcon', Trash2: 'Trash2',
    require: () => ({ jsx, jsxs: jsx }),
  }
  vm.runInNewContext(compile(`${row.getText(source)}\nglobalThis.render = RelationRow`), context)
  for (const direction of ['in', 'out']) {
    for (const [document, expected] of fixtures) {
      const rendered = context.render({ relation: { from: 42, to: 42, document, preview: true }, workspaceId: 'work', direction })
      const link = rendered.props.children.find(child => child?.type === 'button' && child.props.onClick)
      assert.equal(link.props.children, expected)
      assert.equal(link.props.title, expected)
    }
  }
})
