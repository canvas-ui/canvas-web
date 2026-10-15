import test from 'node:test'
import assert from 'node:assert/strict'
import { parentCanvasPath, readSearchQueries, withSearchQueries } from '../src/lib/canvas-navigation.ts'
import { buildWorkspaceUrl, parseWorkspacePathFromUrl } from '../src/utils/url-params.ts'

test('back walks the tree without decoding names or leaving the selected tree', () => {
  let path = '/Náš Domček/literal %2F/a #1?'
  for (const expected of ['/Náš Domček/literal %2F', '/Náš Domček', '/']) {
    path = parentCanvasPath(path)
    assert.equal(path, expected)
    assert.deepEqual(parseWorkspacePathFromUrl(buildWorkspaceUrl('shared-id', path, 'Custom tree')), { treeName: 'Custom tree', path: expected })
  }
  assert.equal(parentCanvasPath(path), null)
})

test('portable search preserves its binding and scope and explicitly clears saved searches', () => {
  const search = withSearchQueries('?context=design&ownerId=shared&scope=workspace&search=old', [' café ', 'second', 'café'])
  assert.deepEqual(readSearchQueries(search), ['café', 'second'])
  const params = new URLSearchParams(search)
  assert.equal(params.get('context'), 'design')
  assert.equal(params.get('ownerId'), 'shared')
  assert.equal(params.get('scope'), 'workspace')
  assert.equal(params.has('search'), false)
  assert.deepEqual(readSearchQueries(withSearchQueries(search, [])), [])
  assert.equal(new URLSearchParams(withSearchQueries(search, [])).has('q'), true)
  assert.deepEqual(readSearchQueries('?q=&search=old'), [])
  assert.deepEqual(readSearchQueries('?search=legacy'), ['legacy'])
})
