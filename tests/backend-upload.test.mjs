import test from 'node:test'
import assert from 'node:assert/strict'
import { backendUploadTarget, backendUploadKey } from '../src/lib/backend-upload.ts'

const home = { driver: 'file', address: 'workspace:home', enabled: true, treePath: '/workspace/home', capabilities: { upload: true }, config: {} }
const mount = { ...home, address: 'photos', treePath: '/device/laptop/photos' }

test('uploads resolve the exact backend and preserve nested, Unicode folder names', () => {
  assert.deepEqual(backendUploadTarget('/workspace/home/Reports/Septembre été', [home]), {
    driver: 'file', address: 'workspace:home', key: 'Reports/Septembre été',
  })
  assert.equal(backendUploadTarget('/device/laptop/photos/2026', [mount]).key, '2026')
  assert.equal(backendUploadTarget('/workspace/home', [home]).key, '')
  assert.equal(backendUploadKey('Reports/été', 'notes #1.json'), 'Reports/été/notes #1.json')
})

test('structural nodes, sibling prefixes and non-writable backends cannot receive uploads', () => {
  for (const path of ['/', '/workspace', '/workspace/home-other', '/device/laptop']) {
    assert.throws(() => backendUploadTarget(path, [home, mount]))
  }
  for (const patch of [{ enabled: false }, { config: { readOnly: true } }, { capabilities: {} }, { capabilities: { upload: false } }]) {
    assert.throws(() => backendUploadTarget('/workspace/home', [{ ...home, ...patch }]))
  }
})

test('filenames and folder paths cannot smuggle traversal or path separators', () => {
  for (const filename of ['', '.', '..', '../secret', 'a/b', 'a\\b', 'bad\0name']) {
    assert.throws(() => backendUploadKey('folder', filename))
  }
  assert.throws(() => backendUploadTarget('/workspace/home/../data', [home]))
  assert.throws(() => backendUploadKey('../data', 'file.txt'))
})
