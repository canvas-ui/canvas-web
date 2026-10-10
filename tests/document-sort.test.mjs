import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const cache = new Map()
let readEnvelope
const overrides = {
  '@/config/api': { API_ROUTES: { contexts: '/contexts', workspaces: '/workspaces' } },
  '@/lib/api': { api: { getEnvelope: (...args) => readEnvelope(...args) } },
  '@/components/workspace/workspace-start-dialog': {},
  '@/lib/remote-mirror': {},
}
function load(path) {
  if (cache.has(path)) return cache.get(path)
  const exports = {}
  cache.set(path, exports)
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(code, { exports, URLSearchParams, console, require: name => overrides[name] ?? load(resolve(
    name.startsWith('@/') ? 'src' : dirname(path), name.replace(/^@\//, '') + '.ts',
  )) })
  return exports
}
const { sortDocuments, documentType, getFieldSortedDocuments } = load(resolve('src/lib/document-sort.ts'))
const note = (id, title) => ({ id, schema: 'data/schema/note', data: { title }, metadata: {} })
const file = (id, filename, contentType) => ({ id, schema: 'data/schema/file', data: {}, metadata: { filename, contentType } })
const ids = documents => Array.from(documents, doc => doc.id)

test('alphabetical uses displayed names, case-insensitive natural order, and reverses', () => {
  const documents = [note(1, 'Note 10'), file(2, 'alpha.md'), note(3, 'note 2')]
  assert.deepEqual(ids(sortDocuments(documents, 'alphabetical', 'asc')), [2, 3, 1])
  assert.deepEqual(ids(sortDocuments(documents, 'alphabetical', 'desc')), [1, 3, 2])
  assert.deepEqual(ids(documents), [1, 2, 3])
})

test('type sorts by extension/schema with alphabetical names within each type', () => {
  const documents = [note(1, 'Beta'), file(2, 'zeta.MD'), file(3, 'alpha.md'), note(4, 'Alpha')]
  assert.equal(documentType(documents[1]), 'md')
  assert.equal(documentType(file(5, 'README', 'text/plain')), 'text/plain')
  assert.deepEqual(ids(sortDocuments(documents, 'type', 'asc')), [3, 2, 4, 1])
  assert.deepEqual(ids(sortDocuments(documents, 'type', 'desc')), [1, 4, 2, 3])
})

test('pagination sorts the whole scoped set before slicing, including capped responses', async () => {
  const documents = [note(1, 'Z'), note(2, 'Y'), note(3, 'A'), note(4, 'B')]
  const reads = []
  const fetch = async pagination => {
    reads.push(pagination.offset)
    return { payload: documents.slice(pagination.offset, pagination.offset + 2), totalCount: 4, count: 2 }
  }
  const first = await getFieldSortedDocuments({ sortBy: 'alphabetical', limit: 2 }, fetch)
  assert.deepEqual(ids(first.payload), [3, 4])
  assert.deepEqual(reads, [0, 0, 2])
  const second = await getFieldSortedDocuments({ sortBy: 'alphabetical', limit: 2, page: 2 }, fetch)
  assert.deepEqual(ids(second.payload), [2, 1])
  assert.equal(second.totalCount, 4)
  assert.equal(second.count, 2)
  const all = await getFieldSortedDocuments({ sortBy: 'alphabetical', limit: 0 }, fetch)
  assert.deepEqual(ids(all.payload), [3, 4, 2, 1])
})

test('empty results and stalled pagination finish without looping', async () => {
  const empty = await getFieldSortedDocuments({ sortBy: 'type' }, async () => ({ payload: [], totalCount: 0 }))
  assert.equal(empty.count, 0)
  await assert.rejects(getFieldSortedDocuments({ sortBy: 'type' }, async () => ({ payload: [note(1, 'A')], totalCount: 2 })), /did not advance/)
})

test('short and empty hydrated pages advance by the scan window without losing later documents', async () => {
  // A bitmap still counts candidate IDs whose records are missing/corrupt.
  // An endpoint cap makes the first window smaller than the requested 500.
  const candidates = [note(1, 'Z'), note(2, 'Y'), null, note(4, 'B'), null, null, note(7, 'A'), null]
  const reads = []
  const result = await getFieldSortedDocuments({ sortBy: 'alphabetical', limit: 0, page: 3 }, async pagination => {
    reads.push({ ...pagination })
    const size = Math.min(pagination.limit, 2)
    return {
      payload: candidates.slice(pagination.offset, pagination.offset + size).filter(Boolean),
      totalCount: candidates.length,
    }
  })
  assert.deepEqual(ids(result.payload), [7, 4, 2, 1])
  assert.equal(result.totalCount, 4)
  assert.deepEqual(reads.map(read => read.offset), [0, 0, 2, 4, 6])
  assert.deepEqual(reads.map(read => read.limit), [500, 2, 2, 2, 2])
  assert.ok(reads.every(read => read.page === undefined))
})

test('endpoints without totals are scanned through the terminal empty page, including caps', async () => {
  const documents = [note(1, 'Z'), note(2, 'Y'), note(3, 'A'), note(4, 'B'), note(5, 'C')]
  const reads = []
  const result = await getFieldSortedDocuments({ sortBy: 'alphabetical', limit: 2, page: 2 }, async pagination => {
    reads.push(pagination.offset)
    return { payload: documents.slice(pagination.offset, pagination.offset + Math.min(pagination.limit, 2)) }
  })
  assert.deepEqual(ids(result.payload), [5, 2])
  assert.equal(result.totalCount, 5)
  assert.deepEqual(reads, [0, 0, 2, 4, 6])
})

test('missing records in the first window are not mistaken for a response cap', async () => {
  const candidates = [null, note(2, 'Z'), null, null, note(5, 'A'), note(6, 'B')]
  const reads = []
  const result = await getFieldSortedDocuments({ sortBy: 'alphabetical', limit: 0 }, async pagination => {
    reads.push(pagination.offset)
    return {
      payload: candidates.slice(pagination.offset, pagination.offset + pagination.limit).filter(Boolean),
      totalCount: candidates.length,
    }
  })
  assert.deepEqual(ids(result.payload), [5, 6, 2])
  assert.deepEqual(reads, [0, 0, 3])
})

for (const scope of ['workspace', 'context']) {
  test(`${scope} service preserves filters and sorts before returning the requested page`, async () => {
    const requests = []
    readEnvelope = async url => {
      const params = new URL(url, 'http://test').searchParams
      requests.push(params)
      const documents = [note(1, 'Z'), note(2, 'A'), note(3, 'B')]
      const offset = Number(params.get('offset'))
      return { payload: documents.slice(offset, offset + 2), totalCount: 3 }
    }
    const options = { sortBy: 'alphabetical', limit: 1, page: 2, queries: ['search'], anyOf: ['tag/a'] }
    let documents, totalCount
    if (scope === 'workspace') {
      const service = load(resolve('src/services/workspace.ts'))
      const result = await service.getWorkspaceDocuments('test', '/folder', ['tag/b'], options)
      documents = result.payload
      totalCount = result.totalCount
    } else {
      const service = load(resolve('src/services/context.ts'))
      documents = await service.getContextDocuments('test', ['tag/b'], [], options)
      totalCount = documents.totalCount
    }
    assert.deepEqual(ids(documents), [3])
    assert.equal(totalCount, 3)
    assert.equal(requests.length, 3)
    for (const params of requests) {
      assert.equal(params.get('page'), null)
      assert.equal(params.get('anyOf'), 'tag/a')
      assert.equal(params.get('allOf'), 'tag/b')
      assert.equal(params.get('q'), 'search')
      assert.equal(params.get('sortBy'), null)
    }
  })
}
