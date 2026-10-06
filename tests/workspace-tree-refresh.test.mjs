import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText

function events() {
  const handlers = new Map()
  const timers = new Map()
  const refreshed = []
  const invalidated = []
  const window = new EventTarget()
  window.addEventListener('workspace:tree:refresh', event => refreshed.push(event.detail))
  const socket = {
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event).add(handler)
    },
    off(event, handler) { handlers.get(event)?.delete(handler) },
  }
  const context = {
    exports: {}, window, CustomEvent,
    setTimeout(fn) { const key = Symbol(); timers.set(key, fn); return key },
    clearTimeout(key) { timers.delete(key) },
    require(name) {
      if (name === '@/lib/socket') return { default: socket }
      if (name === '@/services/workspace') return { invalidateWorkspaceTreeCache: (...args) => invalidated.push(args) }
      throw new Error(name)
    },
  }
  vm.runInNewContext(compile(read('services/workspace-tree-events.ts')), context)
  return {
    watch: context.exports.watchWorkspaceTreeChanges, refreshed, invalidated, timers, handlers,
    emit: (event, payload) => handlers.get(event)?.forEach(handler => handler(payload)),
    flush() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()) },
  }
}

test('ingestion, membership and relation updates do not reload any tree', () => {
  const bus = events()
  const stop = bus.watch('universe', 'ws-1')
  for (let i = 0; i < 100; i++) {
    for (const event of [
      'document.inserted', 'document.inserted.batch', 'document.updated', 'document.linked',
      'tree.document.inserted', 'tree.document.inserted.batch', 'tree.document.removed',
      'tree.layer.merged', 'tree.layer.subtracted', 'backend.resync.changed',
    ]) bus.emit(event, { workspaceId: 'ws-1', treeName: 'backends' })
  }
  bus.flush()
  assert.equal(bus.refreshed.length, 0)
  assert.equal(bus.invalidated.length, 0)
  stop()
})

test('page and sidebar share one scoped refresh, and ignore other workspaces', () => {
  const bus = events()
  const page = bus.watch('universe', 'ws-1')
  const sidebar = bus.watch('universe', 'ws-1')
  bus.emit('tree.path.inserted', { workspaceId: 'ws-2', treeName: 'backends' })
  assert.equal(bus.timers.size, 0)
  for (let i = 0; i < 20; i++) bus.emit('tree.path.inserted', { workspaceId: 'ws-1', treeName: 'backends' })
  assert.equal(bus.timers.size, 1)
  bus.flush()
  assert.deepEqual(bus.invalidated, [['universe', 'backends']])
  assert.equal(bus.refreshed.length, 1)
  assert.equal(bus.refreshed[0].treeName, 'backends')
  assert.equal(bus.refreshed[0].cacheInvalidated, true)

  page()
  bus.emit('tree.layer.updated', { workspaceId: 'ws-1', treeName: 'context' })
  bus.flush()
  assert.deepEqual(bus.invalidated[1], ['universe', 'context'], 'sidebar still refreshes without the page')
  sidebar()
  assert.ok([...bus.handlers.values()].every(set => set.size === 0))
})

test('changes in several trees are batched without broadening to every tree', () => {
  const bus = events()
  const stop = bus.watch('universe', 'ws-1')
  bus.emit('tree.path.inserted', { workspaceId: 'ws-1', treeName: 'directory' })
  bus.emit('tree.path.locked', { workspaceId: 'ws-1', treeName: 'backends' })
  bus.emit('backend.tree.changed', { workspaceId: 'ws-1' })
  bus.flush()
  assert.deepEqual(bus.invalidated, [['universe', 'directory'], ['universe', 'backends']])
  bus.emit('context.path.changed', { workspaceName: 'universe' })
  stop()
  bus.flush()
  assert.equal(bus.refreshed.length, 2, 'unmount cancels the pending refresh')
})

// Exercise production async loaders with controlled completion order.
const menuSource = ts.createSourceFile('menu.tsx', read('components/menu/workspaces/WorkspaceM2.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const callbacks = {}
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['loadTree', 'refreshAll', 'loadLayers', 'loadPins'].includes(node.name.getText(menuSource))) {
    callbacks[node.name.getText(menuSource)] = node.initializer.arguments[0].getText(menuSource)
  }
  ts.forEachChild(node, visit)
}
visit(menuSource)

function menu() {
  const requests = []
  const loading = []
  const data = { backends: { id: 'visible-tree' } }
  const context = {
    loadRequests: { current: new Map() },
    invalidateWorkspaceTreeCache() {},
    getCachedWorkspaceTreeByName: (workspace, tree) => new Promise((resolve, reject) => requests.push({ workspace, tree, resolve, reject })),
    listWorkspaceLayers: () => new Promise(resolve => requests.push({ tree: 'layers', resolve })),
    listWorkspacePins: () => new Promise(resolve => requests.push({ tree: 'pins', resolve })),
  }
  for (const [suffix, key] of [['Context', 'context'], ['Directory', 'directory'], ['Backends', 'backends'], ['Layers', 'layers'], ['Pins', 'pins']]) {
    context[`setIsLoading${suffix}`] = value => loading.push([key, value])
    context[`set${suffix}${['Layers', 'Pins'].includes(suffix) ? '' : 'Tree'}`] = value => { data[key] = value }
  }
  for (const [name, body] of Object.entries(callbacks)) vm.runInNewContext(compile(`globalThis.${name} = ${body}`), context)
  return { context, requests, loading, data }
}

test('background backend refresh keeps branches mounted and leaves other trees alone', async () => {
  const { context, requests, loading, data } = menu()
  context.refreshAll('universe', 'backends', true)
  assert.deepEqual(requests.map(request => request.tree), ['backends', 'pins'])
  assert.deepEqual(loading, [], 'no loading placeholder during refresh')
  assert.equal(data.backends.id, 'visible-tree')
  requests[0].reject(new Error('offline'))
  requests[1].resolve([])
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(data.backends.id, 'visible-tree', 'failed refresh keeps the old tree')
})

test('a slow initial tree response cannot overwrite a newer structure or another workspace', async () => {
  const { context, requests, data } = menu()
  const initial = context.loadTree('universe', 'backends')
  const refresh = context.loadTree('universe', 'backends', true, true)
  requests[1].resolve({ id: 'new-tree' })
  await refresh
  requests[0].resolve({ id: 'old-tree' })
  await initial
  assert.equal(data.backends.id, 'new-tree')
  const oldWorkspace = context.loadTree('universe', 'backends', true)
  context.loadRequests.current.clear() // workspace effect cleanup
  requests[2].resolve({ id: 'old-workspace' })
  await oldWorkspace
  assert.equal(data.backends.id, 'new-tree')
})

test('tree cache shares the new request and ignores a response invalidated in flight', async () => {
  const source = ts.createSourceFile('workspace.ts', read('services/workspace.ts'), ts.ScriptTarget.Latest, true)
  const names = ['invalidateWorkspaceTreeCache', 'getCachedWorkspaceTreeByName', 'withoutTrashNode']
  const functions = source.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(source)).join('\n')
  const requests = []
  const context = {
    exports: {}, workspaceTreeCache: new Map(), workspaceTreeInflight: new Map(), TRASH_PATH_NAME: '.trash',
    workspaceTreeCacheKey: (workspace, tree) => `${workspace}\0${tree}`,
    getWorkspaceTreeByName: () => new Promise(resolve => requests.push(resolve)),
  }
  vm.runInNewContext(compile(functions), context)
  const { getCachedWorkspaceTreeByName: get, invalidateWorkspaceTreeCache: invalidate } = context.exports
  const old = get('universe', 'backends')
  invalidate('universe', 'backends')
  const page = get('universe', 'backends')
  requests[0]({ id: 'old' })
  await old
  const sidebar = get('universe', 'backends')
  assert.equal(requests.length, 2, 'the obsolete request must not evict the shared current request')
  requests[1]({ id: 'new' })
  assert.equal((await page).id, 'new')
  assert.equal((await sidebar).id, 'new')
  assert.equal((await get('universe', 'backends')).id, 'new')
  assert.equal(requests.length, 2)
})
