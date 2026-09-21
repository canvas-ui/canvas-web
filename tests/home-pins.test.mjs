import test from 'node:test'
import assert from 'node:assert/strict'
import { createHomePinsWriter, isHomePinMinimized } from '../src/lib/home-pins.ts'

const pin = id => ({ id, workspaceName: 'work', treeName: 'context', path: `/${id}` })

test('minimizing and reordering rapidly preserves both updates and other UI settings', async () => {
  let stored = { home: { pinnedCanvases: [pin('a'), pin('b')], custom: 'retain' }, m2: { tabOrder: ['directory', 'pins'] } }
  const writer = createHomePinsWriter(async () => structuredClone(stored), async next => {
    await new Promise(resolve => setTimeout(resolve, 5))
    stored = structuredClone(next)
    return next
  }, () => {})
  await Promise.all([
    writer(pins => pins.map(p => p.id === 'a' ? { ...p, minimized: true } : p)),
    writer(pins => [...pins].reverse()),
  ])
  assert.deepEqual(stored.home.pinnedCanvases.map(p => p.id), ['b', 'a'])
  assert.equal(stored.home.pinnedCanvases[1].minimized, true)
  assert.equal(stored.home.custom, 'retain')
  assert.deepEqual(stored.m2.tabOrder, ['directory', 'pins'])
  // A fresh page uses the saved pin flag; it requires no temporary state.
  assert.equal(isHomePinMinimized(stored.home.pinnedCanvases[1], new Set()), true)
  await writer(pins => pins.map(p => ({ ...p, minimized: false })))
  assert.equal(isHomePinMinimized(stored.home.pinnedCanvases[1], new Set()), false)
})

test('temporary quick-add minimization never overwrites the manual choice', () => {
  const manual = { ...pin('a'), minimized: true }
  const visible = pin('b')
  assert.equal(isHomePinMinimized(visible, new Set(['b'])), true)
  assert.equal(isHomePinMinimized(visible, new Set()), false)
  assert.equal(isHomePinMinimized(manual, new Set()), true)
  assert.equal(visible.minimized, undefined)
})

test('a failed config read does not overwrite pins and subsequent saves still work', async () => {
  let fail = true
  let writes = 0
  const writer = createHomePinsWriter(async () => {
    if (fail) throw new Error('offline')
    return { home: { pinnedCanvases: [pin('a')] } }
  }, async next => { writes++; return next }, () => {})
  await assert.rejects(writer(() => []), /offline/)
  assert.equal(writes, 0)
  fail = false
  await writer(pins => pins.map(p => ({ ...p, minimized: true })))
  assert.equal(writes, 1)
})
