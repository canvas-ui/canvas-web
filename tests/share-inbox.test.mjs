import test from 'node:test'
import assert from 'node:assert/strict'
import { stageShare, MAX_SHARE_BYTES } from '../src/lib/share-inbox.ts'

function inbox(failKey) {
  const entries = new Map()
  return {
    entries,
    async put(key, response) {
      if (key === failKey) throw new Error('Quota exceeded')
      entries.set(key, response.clone())
    },
    async delete(key) { return entries.delete(key) },
    async meta() { return entries.get('/share-target-inbox/test/meta').clone().json() },
  }
}
function request(files = []) {
  const form = new FormData()
  form.set('title', 'Shared title')
  form.set('text', 'Shared text')
  for (const file of files) form.append('files', file)
  return new Request('https://canvas.test/share-target', { method: 'POST', body: form })
}

test('stages shared files with names, content types and a ready marker', async () => {
  const cache = inbox()
  await stageShare(request([new File(['hello'], 'note.txt', { type: 'text/plain' })]), 'test', cache)
  const meta = await cache.meta()
  assert.equal(meta.status, 'ready')
  assert.equal(meta.title, 'Shared title')
  assert.deepEqual(meta.fileNames, ['note.txt'])
  const file = cache.entries.get('/share-target-inbox/test/file-0')
  assert.equal(file.headers.get('content-type'), 'text/plain')
  assert.equal(await file.text(), 'hello')
})
test('rejects oversized bodies before parsing', async () => {
  const cache = inbox()
  let parsed = false
  await stageShare({ headers: new Headers({ 'content-length': String(MAX_SHARE_BYTES * 2) }),
    async formData() { parsed = true; throw new Error('must not parse') },
  }, 'test', cache)
  assert.equal(parsed, false)
  assert.equal((await cache.meta()).error, 'too-large')
  assert.equal(cache.entries.size, 1)
})
test('enforces total budget without content-length', async () => {
  const cache = inbox()
  const files = [new File(['a'], 'a'), new File(['b'], 'b')]
  for (const file of files) Object.defineProperty(file, 'size', { value: MAX_SHARE_BYTES / 2 + 1 })
  await stageShare({ headers: new Headers(), async formData() { return { getAll: () => files } } }, 'test', cache)
  assert.equal((await cache.meta()).error, 'too-large')
  assert.equal(cache.entries.size, 1)
})
test('partial failure removes stored bytes and leaves an error', async () => {
  const cache = inbox('/share-target-inbox/test/file-1')
  await stageShare(request([new File(['a'], 'a'), new File(['b'], 'b')]), 'test', cache)
  assert.equal((await cache.meta()).error, 'stash-failed')
  assert.equal(cache.entries.size, 1)
})
test('text shares become ready without file entries', async () => {
  const cache = inbox()
  await stageShare(request(), 'test', cache)
  const meta = await cache.meta()
  assert.equal(meta.status, 'ready')
  assert.equal(meta.text, 'Shared text')
  assert.deepEqual(meta.fileNames, [])
  assert.equal(cache.entries.size, 1)
})
