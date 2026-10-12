import test from 'node:test'
import assert from 'node:assert/strict'
import { selectionRectangle, rectanglesIntersect, selectDocumentsInRectangle } from '../src/lib/selection-rectangle.ts'

test('rectangle selection works in all four drag directions', () => {
  const bounds = { left: 10, top: 20, width: 100, height: 80 }
  for (const [start, end] of [
    [{ x: 10, y: 20 }, { x: 110, y: 100 }],
    [{ x: 110, y: 100 }, { x: 10, y: 20 }],
    [{ x: 110, y: 20 }, { x: 10, y: 100 }],
    [{ x: 10, y: 100 }, { x: 110, y: 20 }],
  ]) assert.deepEqual(selectionRectangle(start, end), bounds)
})

test('partial overlap selects an item, while adjacent edges do not', () => {
  const item = { left: 20, top: 30, width: 100, height: 60 }
  assert.equal(rectanglesIntersect({ left: 0, top: 0, width: 21, height: 31 }, item), true)
  assert.equal(rectanglesIntersect({ left: 0, top: 0, width: 20, height: 30 }, item), false)
  assert.equal(rectanglesIntersect({ left: 120, top: 40, width: 50, height: 20 }, item), false)
})

test('masonry selection follows item geometry rather than a range in document order', () => {
  const items = [
    { id: 1, bounds: { left: 0, top: 0, width: 100, height: 150 } },
    { id: 2, bounds: { left: 0, top: 160, width: 100, height: 60 } },
    { id: 3, bounds: { left: 110, top: 0, width: 100, height: 60 } },
    { id: 4, bounds: { left: 110, top: 70, width: 100, height: 150 } },
  ]
  const rectangle = { left: 5, top: 5, width: 200, height: 50 }
  assert.deepEqual([...selectDocumentsInRectangle(rectangle, items, new Set([2]), false)], [1, 3])
  assert.deepEqual([...selectDocumentsInRectangle(rectangle, items, new Set([2]), true)], [2, 1, 3])
})

test('shrinking a drag removes departed items but retains the original additive selection', () => {
  const items = [
    { id: 1, bounds: { left: 5, top: 5, width: 50, height: 50 } },
    { id: 2, bounds: { left: 65, top: 5, width: 50, height: 50 } },
  ]
  const initial = new Set([9])
  assert.deepEqual([...selectDocumentsInRectangle({ left: 0, top: 0, width: 120, height: 60 }, items, initial, true)], [9, 1, 2])
  assert.deepEqual([...selectDocumentsInRectangle({ left: 0, top: 0, width: 60, height: 60 }, items, initial, true)], [9, 1])
  assert.deepEqual([...selectDocumentsInRectangle({ left: 0, top: 70, width: 60, height: 60 }, items, initial, false)], [])
  assert.deepEqual([...initial], [9])
})
