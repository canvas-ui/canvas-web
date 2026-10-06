import test from 'node:test'
import assert from 'node:assert/strict'
import { matchesShortcut, formatShortcut, dispatchActionShortcut, isMenuKey } from '../src/components/common/action-menu/shortcuts.ts'

const key = (k, mods = {}) => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods })

test('shortcuts match exact modifiers (Mod = Ctrl off macOS)', () => {
  assert.equal(matchesShortcut(key('c', { ctrlKey: true }), 'Mod+C'), true)
  assert.equal(matchesShortcut(key('C', { ctrlKey: true }), 'Mod+C'), true)
  assert.equal(matchesShortcut(key('c'), 'Mod+C'), false)
  assert.equal(matchesShortcut(key('c', { ctrlKey: true, shiftKey: true }), 'Mod+C'), false)
  assert.equal(matchesShortcut(key('Delete'), 'Delete'), true)
  assert.equal(matchesShortcut(key('Delete', { shiftKey: true }), 'Delete'), false)
})

test('shortcut labels read like the platform', () => {
  assert.equal(formatShortcut('Mod+C'), 'Ctrl+C')
  assert.equal(formatShortcut('Shift+F10'), 'Shift+F10')
  assert.equal(formatShortcut('Delete'), 'Del')
})

test('Shift+F10 and the Menu key open menus; plain F10 does not', () => {
  assert.equal(isMenuKey(key('ContextMenu')), true)
  assert.equal(isMenuKey(key('F10', { shiftKey: true })), true)
  assert.equal(isMenuKey(key('F10')), false)
})

test('dispatch runs the first enabled match and skips text fields', () => {
  globalThis.window ??= { getSelection: () => null }
  const ran = []
  const actions = [
    { id: 'off', label: 'Off', shortcut: 'Mod+C', disabled: true, run: () => ran.push('off') },
    { id: 'copy', label: 'Copy', shortcut: 'Mod+C', run: () => ran.push('copy') },
  ]
  const event = (target) => ({
    ...key('c', { ctrlKey: true }), target, defaultPrevented: false, nativeEvent: { isComposing: false },
    preventDefault() { this.defaultPrevented = true }, stopPropagation() {},
  })
  const row = { closest: () => null }
  const input = { closest: () => ({}) }
  assert.equal(dispatchActionShortcut(event(row), actions), true)
  assert.deepEqual(ran, ['copy'])
  assert.equal(dispatchActionShortcut(event(input), actions), false)
  assert.deepEqual(ran, ['copy'])
})
