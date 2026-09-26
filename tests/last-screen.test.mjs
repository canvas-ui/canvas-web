import test from 'node:test'
import assert from 'node:assert/strict'
import { safeLastScreen, lastScreenKey } from '../src/lib/last-screen.ts'

test('keeps workspace, tree, context and query navigation', () => {
  for (const path of ['/workspaces/photos?path=%2FTrips&tree=directory', '/contexts/travel?ownerId=alice', '/home', '/settings#workspace']) assert.equal(safeLastScreen(path), path)
})
test('rejects external redirects, transient flows and credential URLs', () => {
  for (const path of [null, '/', '//evil.example', '/\\evil.example', 'https://evil.example', '/login', '/pub/c/abc', '/share-target?title=x', '/apps/add/note', '/workspaces/a?token=secret']) assert.equal(safeLastScreen(path), null)
})
test('saved screens are separated by authentication session without retaining the token', () => {
  assert.notEqual(lastScreenKey('alice-token'), lastScreenKey('bob-token'))
  assert.equal(lastScreenKey('alice-token'), lastScreenKey('alice-token'))
  assert.equal(lastScreenKey('alice-token').includes('alice-token'), false)
})
