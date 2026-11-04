import test from 'node:test'
import assert from 'node:assert/strict'
import { timeGridDrag, dayRangeDrag } from '../src/lib/calendar/drag.ts'
import { localInput, dateKey } from '../src/lib/calendar/dates.ts'

const days = [0, 1, 2].map(i => new Date(2026, 10, 2 + i))

test('a vertical drag inside one column snaps to the half-hour grid and covers the last slot touched', () => {
  const r = timeGridDrag(days, 1, 9 * 60 + 7, 1, 10 * 60 + 40)
  assert.equal(localInput(r.start), '2026-11-03T09:00')
  assert.equal(localInput(r.end), '2026-11-03T11:00')
  assert.equal(r.allDay, false)
  // Dragging upwards is the same range; a click without movement is one slot.
  assert.equal(localInput(timeGridDrag(days, 1, 10 * 60 + 40, 1, 9 * 60 + 7).start), '2026-11-03T09:00')
  assert.equal(localInput(timeGridDrag(days, 0, 14 * 60, 0, 14 * 60).end), '2026-11-02T14:30')
  assert.equal(localInput(timeGridDrag(days, 0, 1439, 0, 1439).end), '2026-11-03T00:00')
})

test('crossing day columns selects whole days, in either direction', () => {
  const r = timeGridDrag(days, 2, 600, 0, 300)
  assert.deepEqual([dateKey(r.start), dateKey(r.end), r.allDay], ['2026-11-02', '2026-11-05', true])
  const m = dayRangeDrag(new Date(2026, 10, 20), new Date(2026, 10, 18))
  assert.deepEqual([dateKey(m.start), dateKey(m.end)], ['2026-11-18', '2026-11-21'])
})
