import test from 'node:test'
import assert from 'node:assert/strict'
import { documentTimelineDate, groupByDate } from '../src/lib/date-groups.ts'

test('content groups use the message date and preserve server ordering across import dates', () => {
  const docs = [
    { id: 1, createdAt: '2026-10-16T12:00:00Z', timelines: [{ timeline: 'content', start: '2023-04-01T12:00:00Z' }] },
    { id: 2, createdAt: '2026-10-15T12:00:00Z', timelines: [{ timeline: 'content', start: '2024-04-01T12:00:00Z' }] },
    { id: 3, createdAt: '2026-10-14T12:00:00Z' },
  ]
  for (const order of ['asc', 'desc']) {
    const sorted = order === 'asc' ? docs : [...docs].reverse()
    const groups = groupByDate(sorted, doc => documentTimelineDate(doc, 'content'), order, new Date('2026-10-16T12:00:00Z'))
    assert.deepEqual(groups.map(group => group.label), order === 'asc' ? ['2023', '2024', 'Earlier this week'] : ['Earlier this week', '2024', '2023'])
    assert.deepEqual(groups.flatMap(group => group.items.map(doc => doc.id)), sorted.map(doc => doc.id))
  }
})

test('only content dates fall back to creation time, never update time', () => {
  const doc = { createdAt: '2026-10-16T00:00:00Z', updatedAt: '2026-10-17T00:00:00Z', timelines: [{ name: 'project', start: '2020-01-01' }] }
  assert.equal(documentTimelineDate(doc), Date.parse(doc.createdAt))
  assert.equal(documentTimelineDate(doc, 'crud:updated'), Date.parse(doc.updatedAt))
  assert.equal(documentTimelineDate(doc, 't:project'), Date.parse('2020-01-01'))
  assert.equal(documentTimelineDate(doc, 'content'), Date.parse(doc.createdAt))
  assert.equal(documentTimelineDate(doc, 'missing'), null)
  assert.equal(documentTimelineDate({ ...doc, timelines: [{ timeline: 'content', start: 'bad date' }] }, 't:content'), Date.parse(doc.createdAt))
  assert.equal(documentTimelineDate({ timelines: [{ timeline: 'content', start: 'bad date' }] }, 'content'), null)
})
