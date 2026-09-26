import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Exercise the component's event handlers across renders with a phone-sized
// viewport and a fitted landscape image. No browser layout engine is needed.
function viewer() {
  const slots = []
  let cursor = 0
  const react = {
    useState(initial) {
      const i = cursor++
      slots[i] ??= { value: initial }
      return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next }]
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useCallback(fn) { return fn },
    useEffect() {},
  }
  const jsx = (type, props) => ({ type, props })
  const source = readFileSync(new URL('../src/components/common/zoomable-image.tsx', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } })
  const exports = {}
  vm.runInNewContext(outputText, { exports, require(name) {
    if (name === 'react') return react
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    throw new Error(`Unexpected module ${name}`)
  } })
  const host = { clientWidth: 360, clientHeight: 600, getBoundingClientRect: () => ({left: 0, top: 0, width: 360, height: 600}), setPointerCapture() {} }
  let tree
  function render() {
    cursor = 0
    tree = exports.ZoomableImage({ src: 'photo', alt: 'Photo' })
    tree.props.ref.current = host
    tree.props.children.props.ref.current = { offsetWidth: 360, offsetHeight: 180, naturalWidth: 1600, naturalHeight: 800 }
  }
  function event(name, timeStamp, clientX = 180, clientY = 300) {
    tree.props[name]({ pointerId: 1, pointerType: 'touch', timeStamp, clientX, clientY, currentTarget: host, preventDefault() {}, stopPropagation() {} })
    render()
  }
  function tap(t) { event('onPointerDown', t); event('onPointerUp', t + 20) }
  render()
  return { event, tap, transform: () => tree.props.children.props.style.transform }
}

test('double-tap visibly zooms, pans, and returns to fit even with synthesized dblclick', () => {
  const image = viewer()
  image.tap(100)
  image.tap(200)
  assert.match(image.transform(), /scale\(3\.333/)
  image.event('onDoubleClick', 221)
  assert.match(image.transform(), /scale\(3\.333/)
  image.event('onPointerDown', 400)
  image.event('onPointerMove', 410, 230, 300)
  image.event('onPointerUp', 420, 230, 300)
  assert.match(image.transform(), /translate3d\(50px, 0px/)
  image.tap(600)
  image.tap(700)
  image.event('onDoubleClick', 721)
  assert.equal(image.transform(), 'translate3d(0px, 0px, 0) scale(1)')
})

test('cancelled touch cannot become the second tap of a zoom gesture', () => {
  const image = viewer()
  image.tap(100)
  image.event('onPointerDown', 200)
  image.event('onPointerCancel', 220)
  image.tap(300)
  assert.equal(image.transform(), 'translate3d(0px, 0px, 0) scale(1)')
})

test('standalone double-click toggles both into zoom and back to fit', () => {
  const image = viewer()
  image.event('onDoubleClick', 100)
  assert.match(image.transform(), /scale\(3\.333/)
  image.event('onDoubleClick', 600)
  assert.equal(image.transform(), 'translate3d(0px, 0px, 0) scale(1)')
})
