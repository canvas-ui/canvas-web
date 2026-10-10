import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function callbacks(file, names) {
  const source = ts.createSourceFile(file, readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found = []
  function visit(node) {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(source))) found.push(`globalThis.${node.name.getText(source)} = ${node.initializer.getText(source)}`)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.equal(found.length, names.length)
  return ts.transpileModule(found.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
}
const card = callbacks('components/menu/shared/LinkToCard.tsx', ['canCreateAt', 'createFolder'])
const backend = callbacks('components/menu/shared/BackendActionCard.tsx', ['canCreateDestinationFolder', 'createDestinationFolder'])
const serviceSource = ts.createSourceFile('workspace.ts', readFileSync(new URL('../src/services/workspace.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
const targetCode = ts.transpileModule(serviceSource.statements.filter(node => ts.isFunctionDeclaration(node) && ['matchBackendByTreePath', 'backendFolderTarget'].includes(node.name?.text)).map(node => node.getText(serviceSource)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText

function harness(overrides = {}) {
  const writes = [], invalidated = [], events = [], errors = [], states = {}
  const context = {
    exports: {}, Error, saving: false, mode: 'copy', creatingFolder: false, workspaceId: 'universe', workspaceName: 'universe', activeTab: 'backends', multiple: false,
    backends: [
      { driver: 'file', address: 'workspace:home', treePath: '/workspace/home' },
      { driver: 'file', address: 'disk', treePath: '/device/server/disk', config: { readOnly: true } },
      { driver: 'cacache', address: 'cache', treePath: '/workspace/cache' },
    ],
    isDisabled: b => b.config?.readOnly || b.enabled === false,
    addBackendContainers: async (...args) => writes.push(args),
    insertWorkspacePath: async () => { throw new Error('Must create a real backend folder') },
    invalidateWorkspaceTreeCache: (...args) => invalidated.push(args),
    getCachedWorkspaceTreeByName: async () => ({ id: 'fresh-tree' }),
    setCreatingFolder: value => { states.creating = value }, setTree: value => { states.tree = value },
    setSelected: update => { states.selected = update(new Set()) }, setCreateParent: value => { states.parent = value }, setQuery: value => { states.query = value },
    showErrorToast: error => errors.push(error),
    window: { dispatchEvent: event => events.push(event.detail) }, CustomEvent,
    ...overrides,
  }
  vm.runInNewContext(targetCode, context)
  context.backendFolderTarget = context.exports.backendFolderTarget
  vm.runInNewContext(backend, context)
  context.backendFolderCreation = { canCreate: context.canCreateDestinationFolder, create: context.createDestinationFolder }
  vm.runInNewContext(card, context)
  return { context, writes, invalidated, events, errors, states }
}

test('new backend folder is created physically, refreshed, and selected for immediate use', async () => {
  const { context, writes, invalidated, events, states } = harness()
  assert.equal(context.canCreateAt('/workspace/home/Notes'), true)
  await context.createFolder('/workspace/home/Notes', ' Project ')
  assert.deepEqual(Array.from(writes[0], value => Array.isArray(value) ? Array.from(value) : value), ['universe', 'file', 'workspace:home', ['Notes/Project']])
  assert.deepEqual(invalidated, [['universe', 'backends']])
  assert.equal(events[0].treeName, 'backends')
  assert.equal(events[0].cacheInvalidated, true)
  assert.deepEqual(Array.from(states.selected), ['/workspace/home/Notes/Project'])
  assert.equal(states.tree.id, 'fresh-tree')
  assert.equal(states.creating, false)
})

test('structural groups, read-only mounts, and blob stores cannot create destination folders', () => {
  const { context } = harness()
  for (const path of ['/', '/workspace', '/device/server', '/device/server/disk', '/workspace/cache']) assert.equal(context.canCreateAt(path), false, path)
  context.saving = true
  assert.equal(context.canCreateAt('/workspace/home'), false)
})

test('failed backend mkdir leaves the selection unchanged and offers retry', async () => {
  const { context, errors, states, invalidated } = harness({ addBackendContainers: async () => { throw new Error('Permission denied') } })
  await context.createFolder('/workspace/home', 'Project')
  assert.deepEqual(errors, ['Permission denied'])
  assert.equal(states.selected, undefined)
  assert.equal(states.creating, false)
  assert.equal(invalidated.length, 0)
})

test('open picker refreshes scoped changes and ignores obsolete tree responses', async () => {
  const source = ts.createSourceFile('picker.tsx', readFileSync(new URL('../src/components/menu/shared/LinkToCard.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let effect
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0].getText(source).includes('async function loadTree')) effect = node.arguments[0].getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(effect)
  const requests = [], loading = [], state = {}, invalidated = []
  const window = new EventTarget()
  const context = {
    window, workspaceName: 'universe', activeTab: 'backends',
    getCachedWorkspaceTreeByName: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
    invalidateWorkspaceTreeCache: (...args) => invalidated.push(args),
    setTree: tree => { state.tree = tree }, setLoadingTree: value => loading.push(value),
  }
  vm.runInNewContext(ts.transpileModule(`globalThis.stop = (${effect})()`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  const emit = detail => window.dispatchEvent(new CustomEvent('workspace:tree:refresh', { detail }))
  emit({ workspaceName: 'elsewhere', treeName: 'backends' })
  emit({ workspaceName: 'universe', treeName: 'context' })
  assert.equal(requests.length, 1)
  emit({ workspaceName: 'universe', treeName: 'backends', cacheInvalidated: true })
  assert.equal(requests.length, 2)
  requests[1].resolve({ id: 'new-tree' })
  await new Promise(resolve => setImmediate(resolve))
  requests[0].resolve({ id: 'obsolete' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.tree.id, 'new-tree')
  assert.deepEqual(loading, [true, false])
  assert.deepEqual(invalidated, [])
  emit({ workspaceName: 'universe', treeName: 'backends' })
  requests[2].reject(new Error('offline'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.tree.id, 'new-tree', 'failed background refresh keeps the visible tree')
  context.stop()
  emit({ workspaceName: 'universe', treeName: 'backends' })
  assert.equal(requests.length, 3)
})
