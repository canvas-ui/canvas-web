import test from 'node:test'
import assert from 'node:assert/strict'
import { cycleTree, swipeDirection, shortcutForEvent, readKeyBindings, saveKeyBindings } from '../src/lib/key-bindings.ts'

test('tree cycling follows the visible reordered tabs and wraps', () => {
  const order = ['directory', 'pins', 'context', 'layers', 'backends']
  assert.equal(cycleTree(order, 'directory', -1), 'backends')
  assert.equal(cycleTree(order, 'backends', 1), 'directory')
  assert.equal(cycleTree(order, 'pins', 1), 'context')
})

test('swipes ignore taps, short drags and predominantly vertical scrolling', () => {
  assert.equal(swipeDirection(12, 2), 0)
  assert.equal(swipeDirection(60, 80), 0)
  assert.equal(swipeDirection(-70, 5), 1)
  assert.equal(swipeDirection(70, -5), -1)
})

test('shortcuts match exact modifiers and physical keys', () => {
  const event = { code: 'KeyQ', altKey: true, ctrlKey: false, shiftKey: false, metaKey: false }
  assert.equal(shortcutForEvent(event), 'Alt+Q')
  assert.equal(shortcutForEvent({ ...event, ctrlKey: true }), 'Ctrl+Alt+Q')
  assert.equal(shortcutForEvent({ ...event, code: 'ArrowLeft' }), '')
})

test('device settings survive reloads, allow disabling and reject corrupt bindings', () => {
  let stored = null
  globalThis.localStorage = { getItem: () => stored, setItem: (_key, value) => { stored = value } }
  assert.deepEqual(readKeyBindings(), { previousTree: 'Alt+Q', nextTree: 'Alt+W' })
  saveKeyBindings({ previousTree: '', nextTree: 'Ctrl+Shift+N' })
  assert.deepEqual(readKeyBindings(), { previousTree: '', nextTree: 'Ctrl+Shift+N' })
  stored = '{bad'
  assert.equal(readKeyBindings().previousTree, 'Alt+Q')
  stored = JSON.stringify({ previousTree: 'Q', nextTree: 'Alt+W' })
  assert.equal(readKeyBindings().previousTree, 'Alt+Q')
  stored = JSON.stringify({ previousTree: 'Alt+W', nextTree: 'Alt+W' })
  assert.equal(readKeyBindings().previousTree, 'Alt+Q')
  delete globalThis.localStorage
})
