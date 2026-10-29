import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
const jsx = (type, props) => ({ type, props })

function reader() {
  const storage = new Map(), slots = []
  let cursor = 0
  const options = { enabled: true, mobile: false, parent: {} }
  const deps = {
    react: {
      useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { slots[i].value = next }] },
      useCallback: fn => fn, useMemo: fn => fn(),
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/always-on-reader': { useAlwaysOnReader: () => options.enabled },
    '@/lib/reader-width': { useReaderWidth: () => null },
    '@/hooks/use-mobile': { useIsMobile: () => options.mobile },
    '@/components/shell/use-side-view': { SideViewContext: { Provider: 'provider' }, useSideView: () => options.parent },
  }
  const exports = {}
  vm.runInNewContext(compile(read('components/common/document-reading-layout.tsx') + '\nexport { ReadingLayout };'), {
    exports, require: name => deps[name] ?? {},
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  })
  return {
    options, storage,
    gate: props => exports.DocumentReadingLayout(props),
    render(props) { cursor = 0; return exports.ReadingLayout(props).props.value },
    remount() { slots.length = 0 },
  }
}
const props = { enabled: true, workspaceId: 'home', scope: 'inbox', documents: [{ id: 1 }, { id: 2 }], loading: false, children: 'list' }

test('first visible document opens and explicit selection survives folder revisits', () => {
  const ui = reader()
  assert.equal(ui.render(props).entry.document.id, 1)
  ui.render(props).preview({ id: 2 }, 'home')
  assert.equal(ui.render(props).entry.document.id, 2)
  ui.remount()
  assert.equal(ui.render({ ...props, scope: 'archive', documents: [{ id: 3 }] }).entry.document.id, 3)
  ui.remount()
  assert.equal(ui.render(props).entry.document.id, 2)
  assert.equal(ui.storage.get('canvas:readerSelection:inbox'), '2')
})

test('pagination, filtering and deletion fall back to available items; loading and empty lists show no stale document', () => {
  const ui = reader()
  ui.render(props).open({ id: 2 }, 'home')
  assert.equal(ui.render({ ...props, documents: [{ id: 9 }] }).entry.document.id, 9)
  assert.equal(ui.render({ ...props, documents: [] }).entry, null)
  assert.equal(ui.render({ ...props, loading: true }).entry, null)
  assert.equal(ui.render(props).entry.document.id, 2)
})

test('the setting, mobile layouts and explicit document permalinks retain existing navigation', () => {
  const ui = reader()
  assert.notEqual(ui.gate(props), 'list')
  ui.options.enabled = false
  assert.equal(ui.gate(props), 'list')
  ui.options.enabled = true; ui.options.mobile = true
  assert.equal(ui.gate(props), 'list')
  ui.options.mobile = false; ui.options.parent = { location: { documentId: 7 } }
  assert.equal(ui.gate(props), 'list')
  ui.options.parent = {}
  assert.equal(ui.gate({ ...props, enabled: false }), 'list')
  assert.equal(ui.gate({ ...props, workspaceId: undefined }), 'list')
})

test('appearance preference defaults to on and persists explicit opt-out', () => {
  const storage = new Map(), exports = {}
  vm.runInNewContext(compile(read('lib/always-on-reader.ts')), {
    exports, require: () => ({ useSyncExternalStore: (_subscribe, snapshot) => snapshot() }),
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  })
  assert.equal(exports.useAlwaysOnReader(), true)
  exports.setAlwaysOnReader(false)
  assert.equal(exports.useAlwaysOnReader(), false)
  assert.equal(storage.get('canvas:alwaysOnReader'), 'off')
  exports.setAlwaysOnReader(true)
  assert.equal(exports.useAlwaysOnReader(), true)
})
