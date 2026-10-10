import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDocumentIdQuery } from '../src/lib/document-id-query.ts'

test('local ID search extracts exact constraints and preserves text and predicates', () => {
  assert.deepEqual(parseDocumentIdQuery('id:101140'), { text: '', ids: [101140], invalid: false })
  assert.deepEqual(parseDocumentIdQuery('invoice @id:#42 @authored-by:7'), { text: 'invoice  @authored-by:7', ids: [42], invalid: false })
  assert.deepEqual(parseDocumentIdQuery('id:42 id:43').ids, [42, 43])
  assert.deepEqual(parseDocumentIdQuery('"literal id:42"'), { text: '"literal id:42"', ids: [], invalid: false })
  assert.deepEqual(parseDocumentIdQuery('email-id:42'), { text: 'email-id:42', ids: [], invalid: false })
})

test('invalid local ID tokens never become an unconstrained fuzzy query', () => {
  for (const value of ['', '0', '-1', '1.5', '42abc', '4294967296']) {
    assert.equal(parseDocumentIdQuery(`invoice id:${value}`).invalid, true)
  }
})
