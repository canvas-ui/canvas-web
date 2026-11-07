import test from 'node:test'
import assert from 'node:assert/strict'
import { pendingActionDestination, pendingActionPreview, pendingActionsForReview } from '../src/lib/pending-action-destination.ts'

test('approval preview appends the exact Unicode filing subpath once', () => {
  const action = { action: 'download', to: 'workspace:home', folder: 'Architektúra', recursive: true, deleteSource: true }
  const match = { tree: 'context', path: '/Architektúra/Interiér/Pracovňa', rel: 'Interiér/Pracovňa' }
  assert.equal(pendingActionDestination(action, match), 'workspace:home/Architektúra/Interiér/Pracovňa')
  assert.equal(pendingActionDestination({ ...action, recursive: false }, match), 'workspace:home/Architektúra')
  assert.equal(pendingActionDestination({ ...action, folder: '', pathMode: 'full' }, match), 'workspace:home/Architektúra/Interiér/Pracovňa')
  assert.match(pendingActionDestination(action, null), /Missing filing path/)
})


test('action JSON shows the resolved folder without applying recursion twice or mutating the rule', () => {
  const action = { action: 'download', to: 'workspace:home', folder: 'Architektúra', recursive: true, deleteSource: true, kind: 'image' }
  const match = { tree: 'context', path: '/Architektúra/Interiér/Pracovňa', rel: 'Interiér/Pracovňa' }
  const preview = pendingActionPreview(action, match)
  assert.deepEqual(preview, { action: 'download', to: 'workspace:home', folder: 'Architektúra/Interiér/Pracovňa', deleteSource: true, kind: 'image' })
  assert.equal(pendingActionDestination(preview, match), pendingActionDestination(action, match))
  assert.equal(action.folder, 'Architektúra')
  assert.equal(action.recursive, true)
  assert.deepEqual(pendingActionPreview(action, null), action)
  assert.equal(pendingActionPreview({ ...action, folder: '', pathMode: 'full' }, match).folder, 'Architektúra/Interiér/Pracovňa')
  assert.deepEqual(pendingActionPreview({ ...action, folder: '{{doc.data.title}}' }, match), { ...action, folder: '{{doc.data.title}}' })
})

test('review uses allowlisted destination edits while retaining the original proposal', () => {
  const item = { actions: [{ action: 'download', folder: 'Architektúra', recursive: true }], editable: ['actions.0.folder'] }
  const actions = pendingActionsForReview(item, { 'actions.0.folder': 'Archive', 'actions.0.recursive': false })
  assert.equal(actions[0].folder, 'Archive')
  assert.equal(actions[0].recursive, true)
  assert.equal(item.actions[0].folder, 'Architektúra')
  assert.equal(pendingActionPreview(actions[0], { rel: 'Interiér/Pracovňa' }).folder, 'Archive/Interiér/Pracovňa')
})
