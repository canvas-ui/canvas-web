import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { isBrowserNetworkFailure } from '../src/lib/api-network-error.ts'
import { docInGeoSelection } from '../src/utils/geo.ts'
import { buildGeoFilters, buildLensFilters } from '../src/types/workspace.ts'

test('embedding service fetch failure is not a browser connectivity failure', () => {
  assert.equal(isBrowserNetworkFailure({ statusCode: 500, message: 'gpu-image embeddings request failed: fetch failed' }, true), false)
  assert.equal(isBrowserNetworkFailure({ message: 'Failed to fetch' }, false), true)
  assert.equal(isBrowserNetworkFailure({ code: 'ABORTED', message: 'fetch failed' }, true), false)
})

test('map polygons exclude missing locations unless explicitly included', () => {
  const inside = { metadata: { geo: { lat: 48.15, lon: 17.1 } } }
  const outside = { metadata: { geo: { lat: -33.86, lon: 151.2 } } }
  const bbox = { minLat: 48, minLon: 17, maxLat: 49, maxLon: 18 }
  const selection = { kind: 'rect', bbox }
  const gps = { lat: 48.15, lon: 17.1, radiusM: 100 }
  assert.equal(docInGeoSelection({}, selection), false)
  assert.equal(docInGeoSelection(inside, selection), true)
  assert.equal(docInGeoSelection(outside, selection), false)
  assert.equal(docInGeoSelection({}, selection, true), true)
  assert.equal(docInGeoSelection(outside, selection, true), false)
  assert.deepEqual(buildGeoFilters({ bbox, includeUnlocated: true }), ['geo:bbox:48,17,49,18', 'geo:missing'])
  assert.deepEqual(buildLensFilters({ gps, ids: null }), ['geo:near:48.15,17.1,100m'])
})

test('context requests carry feature, spatial, live-image, sort and stacked-search filters', async () => {
  const calls = []
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL('../src/services/context.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(code, { exports, URLSearchParams, console,
    require: name => {
      if (name === '@/config/api') return { API_ROUTES: { contexts: 'https://test/rest/v2/contexts' } }
      if (name === '@/lib/api') return { api: { getEnvelope: async (...args) => { calls.push(args); return { payload: [], count: 0, totalCount: 0 } } } }
      throw new Error(`Unexpected module ${name}`)
    },
  })
  const signal = new AbortController().signal
  await exports.getContextDocuments('default', ['tag/a'], ['geo:near:48,17,100m'], {
    ids: [5, 8], anyOf: ['tag/b'], noneOf: ['tag/c'], queries: ['first', 'second'],
    sortBy: 'content', order: 'asc', applyContextSpec: false, signal,
  }, 'owner')
  const params = new URL(calls[0][0]).searchParams
  for (const [key, expected] of Object.entries({ allOf: ['tag/a'], anyOf: ['tag/b'], noneOf: ['tag/c'], filters: ['geo:near:48,17,100m'], ids: ['5', '8'], q: ['first', 'second'], sortBy: ['content'], order: ['asc'], ownerId: ['owner'], applyContextSpec: ['false'] })) {
    assert.deepEqual(params.getAll(key), expected)
  }
  assert.equal(calls[0][1].signal, signal)
  const empty = await exports.getContextDocuments('default', [], [], { ids: [] })
  assert.equal(empty.length, 0)
  assert.equal(empty.totalCount, 0)
  assert.equal(calls.length, 1, 'zero image matches must never become an unfiltered request')
})
