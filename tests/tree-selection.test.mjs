import test from 'node:test'
import assert from 'node:assert/strict'
import { selectTreeRange, topLevelTreeSelection } from '../src/lib/tree-selection.ts'

test('range selection uses visible order and works in both directions', () => {
  const paths = ['/z', '/z/child', '/a', '/b']
  assert.deepEqual([...selectTreeRange(paths, '/z/child', '/b')], ['/z/child', '/a', '/b'])
  assert.deepEqual([...selectTreeRange(paths, '/b', '/z/child')], ['/z/child', '/a', '/b'])
  assert.deepEqual([...selectTreeRange(paths, '/hidden', '/a')], ['/a'])
})
test('bulk removal skips children covered by a selected parent without matching similar names', () => {
  assert.deepEqual(topLevelTreeSelection(['/a/b', '/a', '/ab', '/ab/c']), ['/a', '/ab'])
})
