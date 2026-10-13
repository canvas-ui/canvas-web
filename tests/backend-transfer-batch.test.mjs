import test from 'node:test'
import assert from 'node:assert/strict'
import { runBackendDeletionBatch } from '../src/lib/backend-transfer-batch.ts'

test('deletion reports progress and stops at the current committed file, retaining remaining selection', async () => {
  let stop = false
  const calls = [], progress = []
  const result = await runBackendDeletionBatch([1, 2, 2, 3], async ids => {
    calls.push(ids)
    stop = true
    return { successful: [{ id: ids[0], mode: 'delete' }], failed: [] }
  }, { shouldStop: () => stop, onProgress: (...value) => progress.push(value) })
  assert.deepEqual(calls, [[1]])
  assert.deepEqual(progress, [[0, 3], [1, 3]])
  assert.deepEqual(result.pending, [2, 3])
  assert.deepEqual(result.successful.map(r => r.id), [1])
})

test('partial deletion failures remain failures and are not repeated within the batch', async () => {
  const result = await runBackendDeletionBatch([1, 2], async ([id]) => id === 1
    ? { successful: [], failed: [{ id, reason: 'file is busy' }] }
    : { successful: [{ id, mode: 'delete' }], failed: [] }, { shouldStop: () => false, onProgress() {} })
  assert.deepEqual(result.successful.map(r => r.id), [2])
  assert.deepEqual(result.failed.map(r => r.id), [1])
  assert.deepEqual(result.pending, [])
})

test('connection loss stops scheduling destructive requests', async () => {
  const calls = []
  const result = await runBackendDeletionBatch([1, 2, 3], async ids => { calls.push(ids); throw new Error('Connection lost') }, { shouldStop: () => false, onProgress() {} })
  assert.deepEqual(calls, [[1]])
  assert.deepEqual(result.pending, [2, 3])
  assert.equal(result.failed[0].reason, 'Connection lost')
})
