import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRRule, expandRRule, describeRRule, repeatPreset, presetRRule, recurrenceEnd } from '../src/lib/calendar/rrule.ts'
import { localInput } from '../src/lib/calendar/dates.ts'

// Expansion steps on LOCAL wall-clock fields, so inputs and expectations are
// local `YYYY-MM-DDTHH:mm` strings — the suite passes in any timezone.
const d = (s) => new Date(s)
const starts = (rule, dtstart, from, to, duration) => expandRRule(parseRRule(rule), d(dtstart), d(from), d(to), duration).map(localInput)

test('weekly BYDAY expands inside the visible range only, DTSTART kept even off-pattern', () => {
  // Jan 6 2026 is a Tuesday.
  assert.deepEqual(starts('FREQ=WEEKLY;BYDAY=TU,TH', '2026-01-06T09:00', '2026-01-12T00:00:00', '2026-01-19T00:00:00'),
    ['2026-01-13T09:00', '2026-01-15T09:00'])
  assert.deepEqual(starts('FREQ=WEEKLY;BYDAY=TH', '2026-01-06T09:00', '2026-01-05T00:00:00', '2026-01-12T00:00:00'),
    ['2026-01-06T09:00', '2026-01-08T09:00'])
})

test('COUNT and UNTIL bound the series; INTERVAL skips', () => {
  assert.equal(starts('FREQ=DAILY;COUNT=3', '2026-01-06T09:00', '2026-01-01T00:00:00', '2026-02-01T00:00:00').length, 3)
  assert.deepEqual(starts('FREQ=DAILY;INTERVAL=2;UNTIL=20260110', '2026-01-06T09:00', '2026-01-01T00:00:00', '2026-02-01T00:00:00'),
    ['2026-01-06T09:00', '2026-01-08T09:00', '2026-01-10T09:00'])
  assert.deepEqual(starts('FREQ=WEEKLY;INTERVAL=2', '2026-01-06T09:00', '2026-01-07T00:00:00', '2026-02-04T00:00:00'),
    ['2026-01-20T09:00', '2026-02-03T09:00'])
})

test('monthly rules: day-of-month skips short months, ordinal weekdays and BYMONTHDAY resolve', () => {
  assert.deepEqual(starts('FREQ=MONTHLY', '2026-01-31T10:00', '2026-02-01T00:00:00', '2026-06-01T00:00:00'),
    ['2026-03-31T10:00', '2026-05-31T10:00'])
  // First Monday of each month.
  assert.deepEqual(starts('FREQ=MONTHLY;BYDAY=1MO', '2026-01-05T10:00', '2026-02-01T00:00:00', '2026-04-01T00:00:00'),
    ['2026-02-02T10:00', '2026-03-02T10:00'])
  assert.deepEqual(starts('FREQ=MONTHLY;BYMONTHDAY=-1', '2026-01-31T10:00', '2026-02-01T00:00:00', '2026-04-01T00:00:00'),
    ['2026-02-28T10:00', '2026-03-31T10:00'])
  assert.deepEqual(starts('FREQ=YEARLY', '2024-02-29T10:00', '2025-01-01T00:00:00', '2029-01-01T00:00:00'),
    ['2028-02-29T10:00'])
})

test('an occurrence that started before the range but overlaps it is included', () => {
  const hour = 3_600_000
  assert.deepEqual(starts('FREQ=DAILY', '2026-01-01T23:30', '2026-01-03T00:00:00', '2026-01-04T00:00:00', hour),
    ['2026-01-02T23:30', '2026-01-03T23:30'])
})

test('unsupported parts are refused rather than mis-expanded', () => {
  assert.equal(parseRRule('FREQ=WEEKLY;BYSETPOS=1;BYDAY=MO'), null)
  assert.equal(parseRRule('FREQ=HOURLY'), null)
  assert.equal(parseRRule('FREQ=WEEKLY;BYDAY=1MO'), null)
})

test('presets round-trip and custom rules describe themselves', () => {
  for (const preset of ['daily', 'weekly', 'monthly', 'yearly', 'weekdays']) assert.equal(repeatPreset(presetRRule(preset)), preset)
  assert.equal(repeatPreset(undefined), 'none')
  assert.equal(repeatPreset('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=20261231T235959Z'), 'custom')
  // The end never forces custom: it is its own control.
  assert.equal(repeatPreset('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20261218'), 'weekdays')
  assert.equal(presetRRule('weekdays', { until: '2026-12-18', count: null }), 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20261218')
  assert.equal(presetRRule('daily', { until: '', count: 10 }), 'FREQ=DAILY;COUNT=10')
  assert.deepEqual(recurrenceEnd('FREQ=DAILY;UNTIL=20261218'), { until: '2026-12-18', count: null })
  assert.deepEqual(recurrenceEnd('FREQ=DAILY;COUNT=3'), { until: '', count: 3 })
  assert.deepEqual(recurrenceEnd(undefined), { until: '', count: null })
  // A date-only UNTIL covers its whole last day.
  const scrum = parseRRule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20261218')
  const starts = expandRRule(scrum, new Date(2026, 10, 9, 9, 0), new Date(2026, 11, 14), new Date(2027, 0, 1), 1800000)
  assert.deepEqual(starts.map(d => d.getDate()), [14, 15, 16, 17, 18])
  assert.match(describeRRule(parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=20261231T235959Z')), /^Every 2 weeks on Tue, Thu until/)
})
