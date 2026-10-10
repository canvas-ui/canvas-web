import test from 'node:test'
import assert from 'node:assert/strict'
import { backendTransferFailureMessage } from '../src/lib/backend-transfer-errors.ts'

test('legacy missing-source responses identify the file, ID, and recovery action', () => {
  const message = backendTransferFailureMessage([{ id: 105939, reason: 'not-found' }], new Map([[105939, 'Budapest.jpg']]))
  assert.match(message, /Budapest.jpg \(ID 105939\)/)
  assert.match(message, /storage index/)
  assert.match(message, /Resync the source backend/)
})
test('partial failures preserve distinct diagnostics and bound the toast length', () => {
  const failed = [{ id: 1, reason: 'target-offline' }, { id: 2, reason: 'not found' }, { id: 3, reason: 'checksum-mismatch' }, { id: 4, reason: 'target-exists' }]
  const message = backendTransferFailureMessage(failed, new Map())
  assert.match(message, /Document 1: target-offline/)
  assert.match(message, /Document 2: Document no longer exists/)
  assert.match(message, /checksum-mismatch/)
  assert.match(message, /1 more failed file\./)
})
