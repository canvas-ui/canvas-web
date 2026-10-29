import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/shell/MenuResizeHandle.tsx', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
function handle() {
  const exports = {}, widths = [], dragging = [], captured = new Set()
  vm.runInNewContext(code, { exports, require: name => name === 'react'
    ? { useRef: () => ({ current: null }) }
    : { jsx: (type, props) => ({ type, props }) } })
  const props = exports.MenuResizeHandle({ width: 280, onResize: width => widths.push(width), onDragging: active => dragging.push(active) }).props
  const event = (x, extra = {}) => ({ clientX: x, button: 0, pointerId: 1, pointerType: 'touch', preventDefault() {}, stopPropagation() {},
    currentTarget: { setPointerCapture: id => captured.add(id), hasPointerCapture: id => captured.has(id), releasePointerCapture: id => captured.delete(id) }, ...extra })
  return { props, event, widths, dragging, captured }
}
test('touch resize captures the pointer, clamps width and ends cleanly', () => {
  const { props, event, widths, dragging, captured } = handle()
  props.onPointerDown(event(280))
  assert.ok(captured.has(1))
  props.onPointerMove(event(400))
  props.onPointerMove(event(900))
  props.onPointerMove(event(0))
  props.onPointerMove(event(400, { pointerId: 2 }))
  assert.deepEqual(widths, [400, 560, 220])
  props.onPointerUp(event(0))
  props.onPointerMove(event(500))
  assert.equal(widths.length, 3)
  assert.equal(captured.size, 0)
  assert.deepEqual(dragging, [true, false])
  assert.ok(props.className.includes('touch-none'))
})
test('cancelled pointers stop resizing; keyboard resizing and reset remain available', () => {
  const { props, event, widths } = handle()
  props.onPointerDown(event(280))
  props.onPointerCancel()
  props.onPointerMove(event(400))
  assert.equal(widths.length, 0)
  props.onKeyDown(event(0, { key: 'ArrowRight' }))
  props.onKeyDown(event(0, { key: 'ArrowLeft', shiftKey: true }))
  props.onKeyDown(event(0, { key: 'Home' }))
  assert.deepEqual(widths, [296, 220, 280])
})
