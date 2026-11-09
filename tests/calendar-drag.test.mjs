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

test('moving a timed entry keeps its duration, snaps the start and stays inside the day', async () => {
  const { moveTimed, resizeTimed, moveByDays } = await import('../src/lib/calendar/drag.ts')
  const o = { start: new Date(2026, 10, 3, 9, 0), end: new Date(2026, 10, 3, 10, 30) }
  const r = moveTimed(days, o, 1, 9 * 60 + 10, 2, 11 * 60 + 52)
  assert.equal(localInput(r.start), '2026-11-04T11:45')
  assert.equal(localInput(r.end), '2026-11-04T13:15')
  // Dragged above midnight: clamps to the top of the day.
  assert.equal(localInput(moveTimed(days, o, 1, 540, 1, 0).start), '2026-11-03T00:00')
  // Resize: the end snaps up to the quarter hour and never falls below start + snap.
  assert.equal(localInput(resizeTimed(days, o, 1, 12 * 60 + 1).end), '2026-11-03T12:15')
  assert.equal(localInput(resizeTimed(days, o, 1, 8 * 60).end), '2026-11-03T09:15')
  // Whole days keep the wall time.
  assert.equal(localInput(moveByDays(o, 3).start), '2026-11-06T09:00')
})

test('movedData writes the storage shape for tasks, all-day and timed events', async () => {
  const { movedData } = await import('../src/lib/calendar/move.ts')
  const start = new Date(2026, 10, 6, 9, 0), end = new Date(2026, 10, 6, 10, 0)
  assert.equal(movedData({ title: 't' }, { kind: 'task', allDay: false }, start, end).dueDate, start.toISOString())
  const allDay = movedData({ start: 'x', end: 'y' }, { kind: 'event', allDay: true }, new Date(2026, 10, 6), new Date(2026, 10, 8))
  assert.deepEqual([allDay.start, allDay.end], ['2026-11-06T00:00:00.000Z', '2026-11-08T00:00:00.000Z'])
  const timed = movedData({ end: '2026-11-03T10:00:00.000Z' }, { kind: 'event', allDay: false }, start, end)
  assert.deepEqual([timed.start, timed.end], [start.toISOString(), end.toISOString()])
  assert.equal(movedData({ end: null }, { kind: 'event', allDay: false }, start, end).end, null)
  assert.equal('end' in movedData({ end: 'z' }, { kind: 'event', allDay: false }, start, start), false)
})
