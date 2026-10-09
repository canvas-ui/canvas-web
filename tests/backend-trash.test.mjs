import test from 'node:test'
import assert from 'node:assert/strict'
import { backendTrashLocation, backendTrashPath, backendTrashRows } from '../src/lib/backend-trash.ts'
import { buildWorkspaceUrl, parseWorkspacePathFromUrl } from '../src/utils/url-params.ts'

const item = (id, key, deletedAt = 1, type = 'file') => ({ id, key, deletedAt, type, sha256: null, size: 1 })

test('Trash addresses preserve exact backend names and original Unicode paths', () => {
  for (const backend of ['workspace:home', 'fs:/media/photos', 'disk #1 %']) {
    const path = backendTrashPath(backend, 'Architektúra/Žehňa')
    assert.deepEqual(backendTrashLocation('backends', path), { backend, prefix: 'Architektúra/Žehňa' })
    const parsed = parseWorkspacePathFromUrl(buildWorkspaceUrl('universe', path, 'backends'))
    assert.deepEqual(backendTrashLocation(parsed.treeName, parsed.path), { backend, prefix: 'Architektúra/Žehňa' })
  }
  assert.deepEqual(backendTrashLocation('backends', '/Trash'), { backend: null, prefix: '' })
  assert.equal(backendTrashLocation('directory', '/Trash/workspace%3Ahome'), null)
  assert.equal(backendTrashLocation('backends', '/workspace/home/Trash'), null)
  assert.equal(backendTrashLocation('backends', '/Trashcan'), null)
})

test('folder restore selects its whole subtree without similarly named siblings', () => {
  const items = [item('1', 'Photos/one.jpg'), item('2', 'Photos/Travel/two.jpg'), item('3', 'Photos-old/three.jpg')]
  const root = backendTrashRows(items)
  assert.deepEqual(root.find(row => row.name === 'Photos').items.map(item => item.id), ['1', '2'])
  assert.deepEqual(backendTrashRows(items, 'Photos').flatMap(row => row.items).map(item => item.id).sort(), ['1', '2'])
  assert.deepEqual(backendTrashRows(items, 'Photos/Travel')[0].items.map(item => item.id), ['2'])
})

test('different deleted versions and whole deleted directories retain independent restore IDs', () => {
  const rows = backendTrashRows([item('old', 'report.txt', 1), item('new', 'report.txt', 2), item('dir', 'Empty', 3, 'directory')])
  assert.equal(rows.length, 3)
  assert.equal(rows[0].directory, true)
  assert.equal(rows[0].navigable, false)
  assert.deepEqual(rows.slice(1).map(row => row.id), ['new', 'old'])
})

test('several thousand deleted files group without losing any original paths', () => {
  const items = Array.from({ length: 6000 }, (_, n) => item(String(n), `Photos/${n}.jpg`))
  assert.equal(backendTrashRows(items)[0].items.length, 6000)
  assert.equal(backendTrashRows(items, 'Photos').length, 6000)
})
