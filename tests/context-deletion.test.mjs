import test from 'node:test'
import assert from 'node:assert/strict'
import { isDeletedContext } from '../src/lib/context-deletion.ts'

test('deleting an owned context preserves shared contexts with the same ID', () => {
  const own = { id: 'work', userId: 'me' }
  const shared = { id: 'work', userId: 'someone', isShared: true }
  const legacyShared = { id: 'work', userId: 'another', type: 'shared' }
  const other = { id: 'home', userId: 'me' }
  assert.deepEqual([own, shared, legacyShared, other].filter(c => !isDeletedContext(c, { id: 'work' })), [shared, legacyShared, other])
})

test('owner-qualified deletion only removes that owner’s context', () => {
  assert.equal(isDeletedContext({ id: 'work', userId: 'someone', isShared: true }, { id: 'work', ownerId: 'someone' }), true)
  assert.equal(isDeletedContext({ id: 'work', userId: 'me' }, { id: 'work', ownerId: 'someone' }), false)
})
