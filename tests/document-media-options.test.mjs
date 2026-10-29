import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const source = ts.createSourceFile('list.tsx', read('components/common/document-list.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
for (const name of ['DocumentRow', 'DocumentTableRow', 'DocumentTile']) {
  test(`${name}: normal activation opens the document; modifier clicks only select`, () => {
    const component = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === name)
    let callback
    function visit(node) {
      if (ts.isVariableDeclaration(node) && ['handleClick', 'handleDocumentClick'].includes(node.name.getText(source))) callback = node.initializer.getText(source)
      ts.forEachChild(node, visit)
    }
    visit(component)
    let opened = 0, selected = 0
    const context = { document: { id: 7 }, isSelected: false, onSelect: () => selected++, setShowDetailModal: value => { if (value) opened++ }, window: { open: () => assert.fail('row must not launch browser') } }
    vm.runInNewContext(compile(`globalThis.click = ${callback}`), context)
    context.click({})
    assert.equal(opened, 1)
    context.click({ ctrlKey: true })
    context.click({ shiftKey: true, preventDefault() {} })
    assert.equal(opened, 1)
    assert.equal(selected, 3)
  })
}
test('all four tile preferences persist and invalid values use masonry', () => {
  const store = new Map([['canvas:tileStyle', 'bad']]), exports = {}
  vm.runInNewContext(compile(read('lib/tile-style.ts')), { exports,
    require: () => ({ useSyncExternalStore: (_subscribe, snapshot) => snapshot() }),
    localStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) },
  })
  assert.equal(exports.useTileStyle(), 'masonry')
  for (const style of ['square', 'flickr', 'masonry', 'original']) {
    exports.setTileStyle(style)
    assert.equal(exports.useTileStyle(), style)
    assert.equal(store.get('canvas:tileStyle'), style)
  }
})
