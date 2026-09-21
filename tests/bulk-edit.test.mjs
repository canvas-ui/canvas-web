import test from 'node:test'
import assert from 'node:assert/strict'
import { bulkEditMetadata } from '../src/lib/bulk-edit.ts'

test('adding tags preserves top-level features and legacy tags without touching file metadata', () => {
  const doc = { features: ['tag/family', 'data/mime/image'], metadata: { contentType: 'image/jpeg', geo: { lat: 1, lon: 2 }, features: ['tag/stale'] }, data: { tags: ['holiday'] } }
  const before = structuredClone(doc)
  assert.deepEqual(bulkEditMetadata(doc, ['family', 'new'], null), {
    features: ['tag/family', 'data/mime/image', 'tag/holiday', 'tag/new'],
  })
  assert.deepEqual(doc, before)
})

test('geotag-only edits leave tags untouched and legacy feature storage remains supported', () => {
  const geo = { lat: 48, lon: 17, source: 'manual' }
  assert.deepEqual(bulkEditMetadata({ features: ['tag/keep'] }, [], geo), { geo })
  assert.deepEqual(bulkEditMetadata({ metadata: { features: ['tag/old'] } }, ['new'], null), { features: ['tag/old', 'tag/new'] })
  assert.deepEqual(bulkEditMetadata({}, [], null), {})
})
