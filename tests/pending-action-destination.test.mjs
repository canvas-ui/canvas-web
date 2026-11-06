import test from 'node:test'
import assert from 'node:assert/strict'
import { pendingActionDestination } from '../src/lib/pending-action-destination.ts'

test('approval preview appends the exact Unicode filing subpath once', () => {
  const action = { action: 'download', to: 'workspace:home', folder: 'Architektúra', recursive: true, deleteSource: true }
  const match = { tree: 'context', path: '/Architektúra/Interiér/Pracovňa', rel: 'Interiér/Pracovňa' }
  assert.equal(pendingActionDestination(action, match), 'workspace:home/Architektúra/Interiér/Pracovňa')
  assert.equal(pendingActionDestination({ ...action, recursive: false }, match), 'workspace:home/Architektúra')
  assert.equal(pendingActionDestination({ ...action, folder: '', pathMode: 'full' }, match), 'workspace:home/Architektúra/Interiér/Pracovňa')
  assert.match(pendingActionDestination(action, null), /Missing filing path/)
})
