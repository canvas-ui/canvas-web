import { test } from 'node:test'
import assert from 'node:assert/strict'
import { documentEventScope, eventTouchesView, treeNameLookup } from '../src/lib/document-event-scope.ts'

const trees = treeNameLookup([{ id: 't-ctx', name: 'context' }, { id: 't-be', name: 'backends' }])
const workView = { tree: 'context', kind: 'context', path: '/work' }
const inboxView = { tree: 'backends', kind: 'directory', path: '/imap/me/INBOX' }

test('an IMAP batch insert under /imap touches the mailbox view, not an unrelated context', () => {
  const scope = documentEventScope('document.inserted.batch', { ids: [1, 2], context: null, directory: { tree: 't-be', path: '/imap/me/INBOX' } }, trees)
  assert.equal(scope.unknown, false)
  assert.equal(eventTouchesView(scope, workView), false)
  assert.equal(eventTouchesView(scope, inboxView), true)
  assert.equal(eventTouchesView(scope, { tree: 'backends', kind: 'directory', path: '/imap' }), true)
  assert.equal(eventTouchesView(scope, { ...workView, wholeWorkspace: true }), true)
})

test('tree events place themselves by treeName + contextSpec', () => {
  const scope = documentEventScope('tree.document.inserted.batch', { treeName: 'context', treeType: 'context', contextSpec: '/work/x', documentIds: [3] })
  assert.equal(eventTouchesView(scope, workView), true)
  assert.equal(eventTouchesView(scope, { ...workView, path: '/home' }), false)
})

test('content/relations updates only touch views that list the document', () => {
  const scope = documentEventScope('document.updated', { id: 7, reason: 'relations', document: {} })
  assert.equal(eventTouchesView(scope, workView, [1, 2]), false)
  assert.equal(eventTouchesView(scope, workView, new Set([7])), true)
})

test('unplaceable events and unresolved tree ids stay conservative', () => {
  assert.equal(eventTouchesView(documentEventScope('document.deleted', { id: 4 }), workView), true)
  assert.equal(eventTouchesView(documentEventScope('document.inserted', null), workView), true)
  // Tree ids not loaded yet: match any directory tree, still path-filtered.
  const unresolved = documentEventScope('document.inserted', { id: 5, directory: { tree: 'new-id', path: '/imap/me' } })
  assert.equal(eventTouchesView(unresolved, inboxView), true)
  assert.equal(eventTouchesView(unresolved, workView), false)
})

test('link events place by `changed`; /a does not overlap /ab', () => {
  const scope = documentEventScope('document.linked', { id: 9, changed: { context: ['/work/p'], directory: null } }, trees)
  assert.equal(eventTouchesView(scope, workView), true)
  assert.equal(eventTouchesView(scope, { ...workView, path: '/workshop' }), false)
})
