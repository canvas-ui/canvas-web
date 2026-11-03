import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as workspace from '../src/types/workspace.ts'

const exports = {}
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/agent-view-context.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, require: () => workspace, structuredClone, Intl })
const { buildAgentViewContext } = exports

test('view snapshot preserves location, filter algebra, stacked search, empty lens IDs and sorting', () => {
  const filters = structuredClone(workspace.DEFAULT_TOOLBOX_FILTERS)
  filters.features = { allOf: ['data/schema/note'], anyOf: ['tag/ai'], noneOf: ['tag/archive'] }
  filters.timeline = { ...filters.timeline, quickFilter: 'today', indexCreated: false, indexUpdated: false, contentEvents: true }
  filters.lens.ids = []
  filters.sort = { sortBy: 'content', order: 'asc' }
  const view = buildAgentViewContext({ workspace: 'foo', treeNameOrId: 'context', path: '/ML/Prompts', scope: 'path' }, filters, null, ['first', 'second'])
  assert.equal(view.path, '/ML/Prompts')
  assert.deepEqual(view.query.features, filters.features)
  assert.deepEqual(view.query.filters, ['t:content:today'])
  assert.deepEqual(view.query.queryOptions.ids, [])
  assert.deepEqual(view.query.queryOptions.queries, ['first', 'second'])
  assert.equal(view.query.queryOptions.sortBy, 'content')
  filters.features.allOf.push('tag/changed')
  assert.deepEqual(view.query.features.allOf, ['data/schema/note'], 'snapshot cannot drift during an asynchronous start or transcription')
  const cleared = buildAgentViewContext({ workspace: 'other', treeNameOrId: 'directory', path: '/', scope: 'workspace' }, workspace.DEFAULT_TOOLBOX_FILTERS, null, [])
  assert.deepEqual(cleared.query.features.allOf, [])
  assert.deepEqual(cleared.query.queryOptions.queries, [])
  assert.equal(cleared.workspace, 'other')
})

test('map and lens constraints use the same query builders as the content view', () => {
  const filters = structuredClone(workspace.DEFAULT_TOOLBOX_FILTERS)
  filters.geo = { bbox: { minLat: 48, minLon: 17, maxLat: 49, maxLon: 18 }, includeUnlocated: true }
  filters.lens.gps = { lat: 48.15, lon: 17.1, radius: 100 }
  const selection = { type: 'polygon', coordinates: [[17, 48], [18, 48], [18, 49]] }
  const view = buildAgentViewContext({ workspace: 'foo', treeNameOrId: null, path: '/ML', contextId: 'work', scope: 'context' }, filters, selection, [])
  assert.deepEqual(view.query, workspace.buildContextBinding(filters, selection, []))
})

test('toolbox text and voice send the snapshot separately from the displayed message', async () => {
  const calls = [], voiceCalls = []
  const exports = {}
  const react = { useState: initial => [initial, () => {}], useCallback: fn => fn, useRef: initial => ({ current: initial }), useEffect: () => {} }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/hooks/useAgentPromptStream.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, AbortController,
    require: name => {
      if (name === 'react') return react
      if (name === '@/config/api') return { API_URL: '/rest/v2' }
      if (name === '@/lib/api') return { api: { stream: async (_url, body, callbacks) => { calls.push(body); callbacks.onComplete() } } }
      if (name === '@/services/agent') return { startAgent: async () => {}, voicePrompt: async (_id, _audio, options) => { voiceCalls.push(options); return { transcript: 'spoken', reply: 'answer' } } }
      throw new Error(name)
    },
  })
  const hook = exports.useAgentPromptStream('helper')
  const snapshot = buildAgentViewContext({ workspace: 'foo', treeNameOrId: 'context', path: '/ML/Prompts', scope: 'path' }, workspace.DEFAULT_TOOLBOX_FILTERS, null, [])
  await hook.send('What is here?', snapshot)
  assert.equal(calls[0].message, 'What is here?')
  assert.deepEqual(calls[0].viewContext, snapshot)
  await hook.sendVoice(new Blob(['audio']), snapshot)
  assert.deepEqual(voiceCalls[0].viewContext, snapshot)
  await hook.send('Now outside the workspace', null)
  assert.equal(calls[1].viewContext, null)
})
