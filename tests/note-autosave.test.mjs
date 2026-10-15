import test from 'node:test'
import assert from 'node:assert/strict'
import { DurableDraft } from '../src/lib/durable-draft.ts'

function storage() {
  const data = new Map()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const initial = { title: 'Note', content: 'Original' }

test('every keystroke survives refresh before the autosave timer fires', async () => {
  const disk = storage()
  const first = new DurableDraft('note:1', initial, { storage: disk, delay: 10000, save: async () => assert.fail('timer must not fire') })
  first.update({ content: 'My painstaking tablet note' })
  first.cancelTimer()
  const recovered = new DurableDraft('note:1', initial, { storage: disk })
  assert.equal(recovered.getSnapshot().value.content, 'My painstaking tablet note')
  assert.equal(recovered.getSnapshot().status, 'draft')
  assert.equal(new DurableDraft('note:2', initial, { storage: disk }).getSnapshot().value.content, 'Original')
})

test('saves are serialized and an earlier acknowledgement cannot erase newer text', async () => {
  const disk = storage(), gate = deferred(), writes = []
  const draft = new DurableDraft('note', initial, { storage: disk, save: async value => { writes.push(value.content); if (writes.length === 1) await gate.promise } })
  draft.update({ content: 'First' })
  const saving = draft.flush()
  draft.update({ content: 'Latest' })
  assert.equal(draft.flush(), saving)
  assert.deepEqual(writes, ['First'])
  assert.equal(JSON.parse(disk.getItem('note')).value.content, 'Latest')
  gate.resolve()
  await saving
  assert.deepEqual(writes, ['First', 'Latest'])
  assert.equal(draft.getSnapshot().status, 'saved')
  assert.equal(disk.getItem('note'), null)
})

test('a failed save keeps the local draft and retry sends the latest text', async () => {
  const disk = storage()
  const draft = new DurableDraft('note', initial, { storage: disk, save: async () => { throw new Error('Offline') } })
  draft.update({ content: 'Still here' })
  await assert.rejects(draft.flush(), /Offline/)
  assert.equal(draft.getSnapshot().status, 'error')
  const writes = []
  const recovered = new DurableDraft('note', initial, { storage: disk, save: async value => writes.push(value.content) })
  await recovered.flush()
  assert.deepEqual(writes, ['Still here'])
  assert.equal(disk.getItem('note'), null)
})

test('initial/empty content does not write, and cleared content remains recoverable', async () => {
  const disk = storage(), writes = []
  const draft = new DurableDraft('note', initial, { storage: disk, valid: value => !!value.content.trim(), save: async value => writes.push(value) })
  await draft.flush()
  draft.update({ content: '' })
  await draft.flush()
  assert.equal(writes.length, 0)
  assert.equal(JSON.parse(disk.getItem('note')).value.content, '')
})

test('new-note identity survives refresh and manual completion does not create twice', async () => {
  const disk = storage(), creates = [], updates = []
  const save = async (value, meta, checkpoint) => {
    if (meta.id) updates.push({ id: meta.id, content: value.content })
    else { creates.push(value.content); checkpoint({ id: 42, workspace: 'studio' }) }
  }
  const draft = new DurableDraft('new', { content: '' }, { storage: disk, retainAfterSave: true, save })
  draft.update({ content: 'First' })
  await draft.flush()
  const recovered = new DurableDraft('new', { content: '' }, { storage: disk, retainAfterSave: true, save })
  recovered.update({ content: 'Final' })
  await recovered.flush()
  await recovered.flush()
  assert.deepEqual(creates, ['First'])
  assert.deepEqual(updates, [{ id: 42, content: 'Final' }])
  recovered.clear()
  assert.equal(disk.getItem('new'), null)
})

test('storage failure is visible and does not block server saving', async () => {
  let saved = false
  const draft = new DurableDraft('note', initial, { storage: { getItem: () => null, setItem: () => { throw new Error('Quota') }, removeItem: () => {} }, save: async () => { saved = true } })
  draft.update({ content: 'Important' })
  assert.equal(draft.getSnapshot().storageError, true)
  await draft.flush()
  assert.equal(saved, true)
  assert.equal(draft.getSnapshot().status, 'saved')
})

test('manual save also drains edits made while a destinationless draft is saving', async () => {
  const disk = storage(), gate = deferred(), writes = []
  const draft = new DurableDraft('home', initial, { storage: disk, retainAfterSave: true })
  draft.update({ content: 'First' })
  const saving = draft.saveWith(async value => { writes.push(value.content); if (writes.length === 1) await gate.promise })
  draft.configure({ retainAfterSave: true }) // The home form still has no automatic destination.
  draft.update({ content: 'Typed while saving' })
  gate.resolve()
  await saving
  assert.deepEqual(writes, ['First', 'Typed while saving'])
  assert.equal(draft.getSnapshot().status, 'saved')
})
