import test from 'node:test'
import assert from 'node:assert/strict'
import { occurrencesIn, groupByDay, layoutDay, isAllDayLane } from '../src/lib/calendar/occurrences.ts'
import { dateKey, startOfWeek, monthGrid, daysSpanned, formatWeekRange } from '../src/lib/calendar/dates.ts'

const event = (id, data) => ({ id, schema: 'data/schema/event/calendar', data })
const task = (id, data) => ({ id, schema: 'data/schema/task', data })

test('events, series and tasks become occurrences inside the range', () => {
  const docs = [
    event(1, { title: 'Single', start: '2026-11-04T09:00:00Z', end: '2026-11-04T10:00:00Z', calendar: 'Work' }),
    event(2, { title: 'Standup', start: '2026-10-06T08:00:00Z', end: '2026-10-06T08:15:00Z', recurrence: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' }),
    event(3, { title: 'Old', start: '2026-10-01T09:00:00Z', end: '2026-10-01T10:00:00Z' }),
    event(4, { title: 'Weird', start: '2026-11-05T09:00:00Z', recurrence: 'FREQ=WEEKLY;BYSETPOS=2;BYDAY=MO' }),
    task(5, { title: 'Pay rent', dueDate: '2026-11-05T22:59:00Z', status: 'completed' }),
  ]
  const list = occurrencesIn(docs, new Date('2026-11-02T00:00:00Z'), new Date('2026-11-09T00:00:00Z'))
  assert.deepEqual(list.map(o => [o.doc.id, o.title]).filter(([id]) => id !== 2), [[1, 'Single'], [4, 'Weird'], [5, 'Pay rent']])
  assert.equal(list.filter(o => o.doc.id === 2).length, 5)
  const weird = list.find(o => o.doc.id === 4)
  assert.equal(weird.unsupportedRule, true)
  assert.equal(list.find(o => o.doc.id === 5).done, true)
  assert.equal(list.find(o => o.doc.id === 1).calendar, 'Work')
})

test('all-day events land on their calendar day and in the all-day lane; multi-day entries cover each day', () => {
  const docs = [
    event(1, { title: 'Holiday', start: '2026-11-04T00:00:00.000Z', end: '2026-11-06T00:00:00.000Z', allDay: true }),
    // Local 22:00 → 02:00 next day, so it crosses midnight in every timezone.
    event(2, { title: 'Overnight', start: new Date(2026, 10, 4, 22).toISOString(), end: new Date(2026, 10, 5, 2).toISOString() }),
  ]
  const list = occurrencesIn(docs, new Date(2026, 10, 1), new Date(2026, 10, 30))
  const holiday = list.find(o => o.doc.id === 1)
  assert.equal(dateKey(holiday.start), '2026-11-04')
  assert.equal(daysSpanned(holiday.start, holiday.end).map(dateKey).join(','), '2026-11-04,2026-11-05')
  assert.ok(isAllDayLane(holiday))
  assert.ok(isAllDayLane(list.find(o => o.doc.id === 2)))
  const byDay = groupByDay(list)
  assert.deepEqual(byDay.get('2026-11-05').map(o => o.doc.id).sort(), [1, 2])
})

test('overlapping timed entries share columns, disjoint ones do not', () => {
  const day = new Date(2026, 10, 4)
  const at = (h, m = 0) => new Date(2026, 10, 4, h, m)
  const occ = (id, s, e) => ({ key: String(id), doc: event(id, {}), kind: 'event', title: '', start: s, end: e, allDay: false, calendar: '', recurring: false, unsupportedRule: false, done: false })
  const blocks = layoutDay(day, [occ(1, at(9), at(10)), occ(2, at(9, 30), at(11)), occ(3, at(10), at(10, 15)), occ(4, at(14), at(15))])
  const by = Object.fromEntries(blocks.map(b => [b.occurrence.doc.id, b]))
  // 9:00–10:00 and 9:30–11:00 overlap; 10:00–10:15 reuses the first column
  // (it starts when that column frees up) and keeps the cluster two wide.
  assert.deepEqual([by[1].column, by[1].columns], [0, 2])
  assert.deepEqual([by[2].column, by[2].columns], [1, 2])
  assert.deepEqual([by[3].column, by[3].columns], [0, 2])
  assert.equal(by[3].height, 30)
  assert.deepEqual([by[4].column, by[4].columns], [0, 1])
})

test('week starts on Monday and month grids hold six weeks', () => {
  assert.equal(dateKey(startOfWeek(new Date(2026, 10, 4))), '2026-11-02')
  assert.equal(dateKey(startOfWeek(new Date(2026, 10, 2))), '2026-11-02')
  const grid = monthGrid(new Date(2026, 10, 1))
  assert.equal(grid.length, 42)
  assert.equal(dateKey(grid[0]), '2026-10-26')
  assert.match(formatWeekRange(new Date(2026, 10, 30)), /^30 \w+ – 6 \w+ 2026$/)
})
