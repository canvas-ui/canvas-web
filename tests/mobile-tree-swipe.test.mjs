import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(readFileSync(new URL('../src/hooks/use-mobile-tree-swipe.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
class Element {
  scrollWidth = 300
  clientWidth = 300
  parentElement = null
  blocked = false
  overflowX = 'visible'
  closest() { return this.blocked }
}
function setup(direction = 'right', enabled = true) {
  const exports = {}
  vm.runInNewContext(source, {
    exports, Element, Date,
    document: { querySelector: () => null }, window: { innerWidth: 360 },
    getComputedStyle: el => ({ overflowX: el.overflowX }),
    require: () => ({ useRef: value => ({ current: value }) }),
  })
  let calls = 0
  const handlers = exports.useMobileTreeSwipe(enabled, direction, () => calls++)
  const target = new Element()
  const event = (x, y = 100) => ({ target, currentTarget: target, touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }], stopPropagation() {} })
  const swipe = (from, to) => { handlers.onTouchStart(event(from)); handlers.onTouchEnd(event(to)) }
  return { handlers, event, target, swipe, calls: () => calls }
}
test('right opens tree and left returns without reversing the action', () => {
  const right = setup()
  right.swipe(70, 220)
  right.swipe(220, 70)
  assert.equal(right.calls(), 1)
  const left = setup('left')
  left.swipe(220, 70)
  assert.equal(left.calls(), 1)
  let prevented = false
  left.handlers.onClickCapture({ preventDefault() { prevented = true }, stopPropagation() {} })
  assert.equal(prevented, true)
})
test('vertical scrolling, multitouch, cancellation, edges and disabled navigation are ignored', () => {
  const s = setup()
  s.handlers.onTouchStart(s.event(70))
  s.handlers.onTouchMove(s.event(130, 150))
  s.handlers.onTouchEnd(s.event(220))
  s.handlers.onTouchStart(s.event(70))
  s.handlers.onTouchMove({ touches: [] })
  s.handlers.onTouchEnd(s.event(220))
  s.handlers.onTouchStart(s.event(70))
  s.handlers.onTouchCancel()
  s.handlers.onTouchEnd(s.event(220))
  s.swipe(10, 200)
  s.swipe(70, 100)
  assert.equal(s.calls(), 0)
  const disabled = setup('right', false)
  disabled.swipe(70, 220)
  assert.equal(disabled.calls(), 0)
})
test('controls and nested horizontal scrollers keep their own gestures even at their edges', () => {
  const s = setup()
  s.target.blocked = true
  s.swipe(70, 220)
  s.target.blocked = false
  const parent = new Element()
  parent.overflowX = 'auto'
  parent.scrollWidth = 600
  s.target.parentElement = parent
  s.target.overflowX = 'scroll'
  s.target.scrollWidth = 600
  s.swipe(70, 220)
  assert.equal(s.calls(), 0)
})
