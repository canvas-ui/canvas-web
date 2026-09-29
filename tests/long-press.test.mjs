import test from 'node:test'
import assert from 'node:assert/strict'
import { createLongPress } from '../src/lib/long-press.ts'

test('long press opens once after 500ms and suppresses the following click', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const gesture = createLongPress()
  let opened = 0
  gesture.start(20, 30, () => opened++)
  t.mock.timers.tick(499)
  assert.equal(opened, 0)
  gesture.move(23, 32)
  t.mock.timers.tick(1)
  assert.equal(opened, 1)
  assert.equal(gesture.contextMenu(), true)
  gesture.cancel()
  assert.equal(gesture.consumeClick(), true)
  assert.equal(gesture.consumeClick(), false)
})

test('scrolling, release and cancellation prevent the menu', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const gesture = createLongPress()
  let opened = 0
  gesture.start(0, 0, () => opened++)
  gesture.move(20, 0)
  t.mock.timers.tick(600)
  gesture.start(0, 0, () => opened++)
  gesture.cancel()
  t.mock.timers.tick(600)
  assert.equal(opened, 0)
  assert.equal(gesture.consumeClick(), false)
})

test('native menu wins without a second delayed menu', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const gesture = createLongPress()
  let opened = 0
  gesture.start(0, 0, () => opened++)
  assert.equal(gesture.contextMenu(), false)
  t.mock.timers.tick(600)
  assert.equal(opened, 0)
  assert.equal(gesture.consumeClick(), true)
  gesture.reset()
  assert.equal(gesture.consumeClick(), false)
})
