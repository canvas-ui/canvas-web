import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as workspace from '../src/types/workspace.ts'

function harness(overrides = {}, baseline = null) {
  let reducer, current
  const actions = [], requests = [], writes = [], effects = [], timers = [], refs = [], listeners = new Map()
  let refIndex = 0
  const exports = {}
  const location = { pathname: '/contexts/default', search: '?q=chair&q=wooden' }
  const react = {
    useReducer: (fn, initial) => { reducer = fn; current = { ...initial, activeContextType: 'context', activeContextId: 'default', ...overrides }; return [current, action => actions.push(action)] },
    useMemo: fn => fn(), useCallback: fn => fn, useEffect: fn => effects.push(fn),
    useRef: value => { const ref = { current: refIndex++ === 0 ? baseline : value }; refs.push(ref); return ref }, useState: value => [value, () => {}],
  }
  const code = ts.transpileModule(readFileSync(new URL('../src/components/toolbox/toolbox-context.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const window = { location, setTimeout: fn => { timers.push(fn); return timers.length }, clearTimeout() {}, addEventListener() {}, removeEventListener() {} }
  vm.runInNewContext(code, { exports, URLSearchParams, console, window,
    require: name => {
      if (name === 'react') return react
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) }
      if (name === '@/lib/socket') return { default: { isConnected: () => true, on: (event, fn) => { listeners.set(event, fn); return () => listeners.delete(event) }, request: async (event, payload) => { requests.push({ event, payload }); return { liveQuery: payload.liveQuery } } } }
      if (name === 'react-router-dom') return { useLocation: () => location, useNavigate: () => () => {} }
      if (name === './use-toolbox') return { ToolboxCtx: { Provider: 'Provider' } }
      if (name === '@/types/workspace') return workspace
      if (name === '@/services/workspace') return { DEFAULT_WORKSPACE_TREE_NAME: 'context' }
      if (name === '@/services/context') return { getContext: async () => ({ metadata: {} }), patchContext: async (id, body) => writes.push({ id, body }) }
      if (name === '@/lib/schema-meta') return { ABSTRACTION_PREFIX: 'data/schema/' }
      if (name === '@/utils/url-params') return {}
      throw new Error(`Unexpected module ${name}`)
    },
  })
  const value = exports.ToolboxProvider({ children: null }).props.value
  return { value, reducer, current, actions, requests, writes, effects, timers, refs, listeners }
}

test('filter edits publish only in Live mode and received snapshots do not echo', async () => {
  const filters = { ...workspace.DEFAULT_TOOLBOX_FILTERS, lens: { gps: null, ids: [] } }
  const queries = ['chair', 'wooden']
  const baseline = JSON.stringify({ filters: workspace.DEFAULT_TOOLBOX_FILTERS, geoSelection: null, queries })
  const local = harness({ filters }, baseline)
  local.effects.find(fn => fn.toString().includes('publishing.current'))()
  assert.equal(local.timers.length, 0)
  const live = harness({ filters, liveEnabled: true }, baseline)
  live.effects.find(fn => fn.toString().includes('publishing.current'))()
  assert.equal(live.timers.length, 1)
  live.timers[0]()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(live.requests[0].payload.liveQuery.filters.lens.ids, [])
  const receiver = harness({ filters, liveEnabled: true }, baseline)
  receiver.effects.find(fn => fn.toString().includes('let requestId'))()
  await new Promise(resolve => setImmediate(resolve))
  const liveQuery = { filters, geoSelection: null, queries, binding: workspace.buildContextBinding(filters, null, queries) }
  receiver.listeners.get('context.updated')({ id: 'default', metadata: {}, liveQuery })
  receiver.effects.find(fn => fn.toString().includes('publishing.current'))()
  assert.equal(receiver.timers.length, 0, 'a receiving view must not retransmit the same snapshot')
})

test('continuous input publishes the newest state without waiting for input to stop', async () => {
  const filters = { ...workspace.DEFAULT_TOOLBOX_FILTERS, lens: { gps: null, ids: [1] } }
  const baseline = JSON.stringify({ filters: workspace.DEFAULT_TOOLBOX_FILTERS, geoSelection: null, queries: ['chair', 'wooden'] })
  const h = harness({ filters, liveEnabled: true }, baseline)
  const publish = h.effects.find(fn => fn.toString().includes('publishing.current'))
  publish()
  const latest = { ...filters, lens: { gps: null, ids: [2, 3] } }
  h.refs[1].current = { ...h.current, filters: latest }
  publish()
  assert.equal(h.timers.length, 1, 'new edits must not replace the scheduled publish')
  h.timers[0]()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(h.requests[0].payload.liveQuery.filters.lens.ids, [2, 3])
})

test('Live is explicit and Save freezes camera IDs, GPS, geometry and the search stack', async () => {
  const filters = { ...workspace.DEFAULT_TOOLBOX_FILTERS, lens: { gps: { lat: 48, lon: 17, radiusM: 100 }, ids: [4, 9] } }
  const selection = { kind: 'polygon', points: [{ lat: 48, lon: 17 }, { lat: 49, lon: 17 }, { lat: 48, lon: 18 }] }
  const h = harness({ filters, geoSelection: selection })
  assert.equal(h.current.liveEnabled, false)
  await h.value.setLiveEnabled(true)
  assert.equal(h.requests[0].event, 'context.filters.set')
  assert.deepEqual(h.requests[0].payload.liveQuery.binding.queryOptions.ids, [4, 9])
  assert.deepEqual([...h.requests[0].payload.liveQuery.queries], ['chair', 'wooden'])
  await h.value.saveFilters()
  const body = h.writes[0].body
  assert.deepEqual(body.metadata.toolbox.lens.ids, [4, 9])
  assert.deepEqual(body.metadata.toolboxGeoSelection, selection)
  assert.deepEqual([...body.queryOptions.queries], ['chair', 'wooden'])
  assert.deepEqual(body.filters, ['geo:near:48,17,100m'])
  await h.value.setLiveEnabled(false)
  assert.equal(h.requests.at(-1).payload.liveQuery, null)
})

test('dirty tracking includes empty camera matches and clearing a saved polygon', () => {
  const h = harness()
  const saved = { ...h.current, savedFilters: workspace.DEFAULT_TOOLBOX_FILTERS }
  const edited = h.reducer(saved, { type: 'SET_FILTERS', filters: { ...workspace.DEFAULT_TOOLBOX_FILTERS, lens: { gps: null, ids: [] } } })
  assert.equal(edited.isDirty, true, 'a zero-match snapshot must remain saveable')
  const polygon = { kind: 'polygon', points: [{ lat: 1, lon: 1 }, { lat: 2, lon: 1 }, { lat: 1, lon: 2 }] }
  const cleared = h.reducer({ ...saved, savedGeoSelection: polygon, geoSelection: polygon }, { type: 'SET_GEO_SELECTION', selection: null })
  assert.equal(cleared.isDirty, true)
  h.value.clearFilters()
  assert.ok(h.actions.some(a => a.type === 'SET_GEO_SELECTION' && a.selection === null))
})

test('image candidates are scoped to the selected tree, path and filters', async () => {
  const exports = {}, calls = []
  const code = ts.transpileModule(readFileSync(new URL('../src/services/lens.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(code, { exports,
    require: name => {
      if (name === '@/config/api') return { API_ROUTES: { workspaces: '/workspaces' } }
      if (name === '@/lib/api') return { api: { postEnvelope: async (...args) => { calls.push(args); return { payload: [4, 9], count: 2 } } } }
      throw new Error(`Unexpected module ${name}`)
    },
  })
  const signal = new AbortController().signal
  await exports.searchByImage('work', 'data:image/jpeg;base64,frame', { idsOnly: true, contextPath: '/chairs', treeId: 'tree-2', features: { allOf: ['tag/wood'], anyOf: [], noneOf: [] }, filters: ['t:content:today'], applyCanvasQuerySpec: false, signal })
  assert.equal(calls[0][1].scope, 'path')
  assert.equal(calls[0][1].context, '/chairs')
  assert.equal(calls[0][1].treeNameOrTreeId, 'tree-2')
  assert.deepEqual(calls[0][1].allOf, ['tag/wood'])
  assert.deepEqual(calls[0][1].filters, ['t:content:today'])
  assert.equal(calls[0][1].applyCanvasQuerySpec, false)
  assert.equal(calls[0][2].signal, signal)
})
