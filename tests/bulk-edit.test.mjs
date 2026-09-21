import test from 'node:test'
import assert from 'node:assert/strict'
import { bulkEditMetadata, bulkEditDocument } from '../src/lib/bulk-edit.ts'

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


test('bulk comment changes replace or clear the top-level comment only when requested', () => {
  const doc = { id: 7, schema: 'data/schema/file', schemaVersion: '1.0', comment: 'Original', features: ['tag/keep'], metadata: { contentType: 'image/jpeg', geo: { lat: 1, lon: 2 } } }
  const before = structuredClone(doc)
  const tagOnly = bulkEditDocument(doc, ['new'], null)
  assert.equal(Object.hasOwn(tagOnly, 'comment'), false)
  const replace = bulkEditDocument(doc, [], null, ' Trip notes\nSecond line ')
  assert.equal(replace.comment, 'Trip notes\nSecond line')
  assert.deepEqual(replace.metadata, {})
  assert.equal(Object.hasOwn(replace, 'data'), false)
  assert.equal(bulkEditDocument(doc, [], null, '').comment, '')
  const combined = bulkEditDocument(doc, ['new'], { lat: 48, lon: 17, source: 'manual' }, 'New comment')
  assert.equal(combined.comment, 'New comment')
  assert.deepEqual(combined.metadata.features, ['tag/keep', 'tag/new'])
  assert.equal(combined.metadata.geo.lat, 48)
  assert.deepEqual(doc, before)
})
