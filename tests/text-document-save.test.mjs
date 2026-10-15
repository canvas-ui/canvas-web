import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const code = ts.transpileModule(readFileSync(new URL('../src/services/text-documents.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
function harness({ nextId = 42, fail = false } = {}) {
  const calls = [], exports = {}
  const saved = { id: nextId, version: 8, checksumArray: ['sha256/latest'] }
  vm.runInNewContext(code, { exports, Blob, require: name => ({
    '@/services/blobs': { writeBackendObject: async (...args) => { calls.push(['write', ...args]); if (fail) throw new Error('conflict'); return { docId: nextId } } },
    '@/services/workspace': {
      updateWorkspaceDocument: async (...args) => calls.push(['metadata', ...args]),
      getWorkspaceDocument: async (...args) => { calls.push(['read', ...args]); return saved },
    },
    '@/lib/document-display': { getLocationFilename: () => 'draft.txt' },
    '@/lib/text-document': { documentBodyKind: () => 'text' },
  })[name] })
  const doc = { id: 42, schema: 'data/schema/file', schemaVersion: '2.0', comment: '', checksumArray: ['sha256/old'], locations: [{ url: 'stored://workspace:home/draft.txt' }] }
  return { save: extra => exports.saveTextFileContent('studio', doc, 'test7', extra), calls, saved }
}

test('a file save returns the committed row and does not rewrite unchanged metadata', async () => {
  const h = harness()
  assert.equal(await h.save({ comment: '' }), h.saved)
  assert.deepEqual(h.calls.map(c => c[0]), ['write', 'read'])
  assert.equal(await h.calls[0][3].text(), 'test7\n')
  assert.equal(h.calls[0][4].ifMatch, 'old')
  assert.deepEqual(h.calls[1], ['read', 'studio', 42])
})

test('a successor returned by the backend is used for metadata and the open preview', async () => {
  const h = harness({ nextId: 43 })
  assert.equal(await h.save({ comment: 'revised' }), h.saved)
  assert.deepEqual(h.calls.map(c => c[0]), ['write', 'metadata', 'read'])
  assert.equal(h.calls[1][2].id, 43)
  assert.deepEqual(h.calls[2], ['read', 'studio', 43])
})

test('a refused file write never publishes a saved row or changes metadata', async () => {
  const h = harness({ fail: true })
  await assert.rejects(h.save({ comment: 'revised' }), /conflict/)
  assert.deepEqual(h.calls.map(c => c[0]), ['write'])
})
