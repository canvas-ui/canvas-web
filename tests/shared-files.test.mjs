import test from 'node:test'
import assert from 'node:assert/strict'
import { classifySharedFiles } from '../src/lib/shared-files.ts'

test('JPEG bytes override a generic type and extensionless name without changing content', async () => {
  const file = new File([new Uint8Array([255, 216, 255, 224, 1])], 'shared', { type: 'application/octet-stream', lastModified: 123 })
  const result = await classifySharedFiles([file])
  assert.equal(result.kind, 'photo')
  assert.equal(result.files[0].type, 'image/jpeg')
  assert.equal(result.files[0].lastModified, 123)
  assert.equal(result.files[0].name, 'shared')
  assert.deepEqual(await result.files[0].arrayBuffer(), await file.arrayBuffer())
})

test('uses media MIME metadata and falls back to case-insensitive extensions', async () => {
  for (const file of [new File(['x'], 'image', { type: 'image/png' }), new File(['x'], 'PHOTO.HEIC'), new File(['x'], 'clip.MOV', { type: 'application/octet-stream' })]) {
    assert.equal((await classifySharedFiles([file])).kind, 'photo')
  }
})

test('known non-media signatures override misleading photo metadata', async () => {
  const result = await classifySharedFiles([new File(['%PDF-1.7'], 'photo.jpg', { type: 'image/jpeg' })])
  assert.equal(result.kind, 'file')
  assert.equal(result.files[0].type, 'application/pdf')
})

test('does not override a specific non-media MIME using only an extension', async () => {
  assert.equal((await classifySharedFiles([new File(['hello'], 'photo.jpg', { type: 'text/plain' })])).kind, 'file')
})

test('mixed batches retain every attachment and normalized media types', async () => {
  const result = await classifySharedFiles([new File(['x'], 'photo.jpg'), new File(['text'], 'readme.txt', { type: 'text/plain' })])
  assert.equal(result.kind, 'file')
  assert.equal(result.files.length, 2)
  assert.equal(result.files[0].type, 'image/jpeg')
  assert.equal(result.files[1].type, 'text/plain')
})

test('multiple photos use the preview form; empty input stays a file batch', async () => {
  assert.equal((await classifySharedFiles([new File(['x'], 'a.png'), new File(['x'], 'b.jpg')])).kind, 'photo')
  assert.equal((await classifySharedFiles([])).kind, 'file')
})

test('recognizes HEIC and AVIF container brands', async () => {
  for (const [brand, mime] of [['heic', 'image/heic'], ['avif', 'image/avif']]) {
    const bytes = new Uint8Array(20)
    new DataView(bytes.buffer).setUint32(0, 20)
    bytes.set(new TextEncoder().encode('ftypmif1'), 4)
    bytes.set(new TextEncoder().encode(brand), 16)
    const result = await classifySharedFiles([new File([bytes], 'shared')])
    assert.equal(result.kind, 'photo')
    assert.equal(result.files[0].type, mime)
  }
})
