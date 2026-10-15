import test from 'node:test'
import assert from 'node:assert/strict'
import { documentSideHash, readDocumentSideLocation, DOCUMENT_SECTIONS } from '../src/lib/document-side-location.ts'

test('copied document fragments retain workspace, section and fullscreen without changing the canvas URL', () => {
  for (const section of DOCUMENT_SECTIONS) {
    for (const maximized of [false, true]) {
      const location = { workspaceId: 'Náš workspace / #1&100%', documentId: 100002, section, maximized }
      const url = new URL('https://canvas.local/contexts/design?q=mobile&scope=workspace')
      url.hash = documentSideHash(location)
      assert.deepEqual(readDocumentSideLocation(new URL(url.href).hash), location)
      assert.equal(url.pathname + url.search, '/contexts/design?q=mobile&scope=workspace')
    }
  }
})

test('ordinary anchors and invalid document IDs never open a document pane', () => {
  for (const hash of ['', '#metadata', '#section=view', '#document=1', '#document=1&workspace=',
    ...['0', '-1', 'NaN', '1.2', '1e2', '9007199254740992', '1/2'].map(id => `#document=${id}&workspace=home`)]) {
    assert.equal(readDocumentSideLocation(hash), null, hash)
  }
  assert.deepEqual(readDocumentSideLocation('#document=23&workspace=home&section=unknown&fullscreen=false'), {
    workspaceId: 'home', documentId: 23, section: 'view', maximized: false,
  })
})
