import test from 'node:test'
import assert from 'node:assert/strict'
import { portableDocument } from '../src/lib/document-export.ts'

test('file export preserves checksum, location and document metadata while dropping the local ID', () => {
  const document = { id: 42, schema: 'data/schema/file', schemaVersion: '1', data: {}, checksumArray: ['sha256:abc'], locations: [{ url: 'file://host/photo.jpg', metadata: { filename: 'photo.jpg', size: 99 } }], metadata: { filename: 'Photo', contentType: 'image/jpeg' }, features: ['tag/holiday'], comment: 'Keep me', timelines: [{ name: 'content', start: '2020-01-01' }], createdAt: '2020-01-01', updatedAt: '2021-01-01', indexOptions: { checksumFields: ['data'] } }
  const exported = JSON.parse(JSON.stringify(portableDocument(document)))
  assert.equal(exported.id, undefined)
  assert.deepEqual(exported, Object.fromEntries(Object.entries(document).filter(([key]) => key !== 'id')))
  assert.equal(document.id, 42)
})
