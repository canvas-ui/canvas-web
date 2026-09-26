import test from 'node:test'
import assert from 'node:assert/strict'
import { selectDocumentRange } from '../src/lib/document-selection.ts'

test('selects inclusive ranges in the displayed sort order in either direction', () => {
  const order = [9, 2, 7, 1]
  assert.deepEqual([...selectDocumentRange(order, 2, 1, new Set([9]))], [2, 7, 1])
  assert.deepEqual([...selectDocumentRange(order, 1, 2, new Set())], [2, 7, 1])
})
test('repeated shift selections can shrink while Ctrl/Cmd+Shift adds', () => {
  const order = [1, 2, 3, 4, 5]
  const initial = selectDocumentRange(order, 2, 5, new Set())
  assert.deepEqual([...selectDocumentRange(order, 2, 3, initial)], [2, 3])
  assert.deepEqual([...selectDocumentRange(order, 2, 3, new Set([5]), true)], [5, 2, 3])
})
test('hidden or missing anchors start a new range, and hidden items are excluded', () => {
  assert.deepEqual([...selectDocumentRange([1, 3, 5], 1, 5, new Set())], [1, 3, 5])
  for (const anchor of [null, 2]) assert.deepEqual([...selectDocumentRange([1, 3, 5], anchor, 5, new Set([1]))], [5])
  assert.deepEqual([...selectDocumentRange([1, 3], 1, 5, new Set([3]))], [3])
})
