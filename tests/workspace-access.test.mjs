import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { canManageWorkspace } from '../src/lib/workspace-access.ts'

const source = file => ts.createSourceFile(file, readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const evaluate = (code, context) => {
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return context.run
}
const shared = permissions => ({ id: 'shared-id', name: 'team', status: 'active', isShared: true, sharedVia: { type: 'user', permissions } })

test('settings require ownership or an effective admin grant, including email and group shares', () => {
  assert.equal(canManageWorkspace(null), false)
  assert.equal(canManageWorkspace({ id: 'own' }), true)
  assert.equal(canManageWorkspace({ access: { isOwner: true, permissions: [] } }), true)
  for (const permissions of [[], ['read'], ['read', 'write'], ['read', 'write', 'admin']]) {
    const expected = permissions.includes('admin')
    for (const type of ['user', 'group']) {
      assert.equal(canManageWorkspace({ ...shared(permissions), sharedVia: { type, permissions } }), expected)
    }
    assert.equal(canManageWorkspace({ access: { isOwner: false, permissions } }), expected)
    assert.equal(canManageWorkspace({ access: { isOwner: true, permissions: ['admin'] }, remote: { permissions } }), expected, 'local ownership of a remote reference must not override remote permissions')
  }
  assert.equal(canManageWorkspace({ type: 'shared', sharedVia: 'legacy' }), false)
})

test('workspace detail reads preserve the API access envelope', async () => {
  const file = source('services/workspace.ts')
  const fn = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'getWorkspace')
  let payload = { workspace: { id: 'shared-id', name: 'team' }, access: { isOwner: false, permissions: ['read', 'write'] } }
  const getWorkspace = evaluate(`${fn.getText(file)}\nglobalThis.run = getWorkspace`, {
    exports: {}, API_ROUTES: { workspaces: '/workspaces' }, api: { get: async () => payload },
  })
  const details = await getWorkspace('shared-id')
  assert.equal(details.name, 'team')
  assert.deepEqual(details.access, payload.access)
  assert.equal(canManageWorkspace(details), false)
  payload = { id: 'own-id', name: 'own' }
  assert.deepEqual(await getWorkspace('own-id'), payload, 'legacy flat responses remain supported')
})

test('direct settings URLs never fetch admin panels for read/write members', async () => {
  const file = source('pages/workspaces/[workspaceName]/settings.tsx')
  const content = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'WorkspaceSettingsContent')
  let load
  const effects = []
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'load') load = node
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect') effects.push(node.arguments[0])
    ts.forEachChild(node, visit)
  }
  visit(content)
  for (const permissions of [['read'], ['read', 'write'], ['read', 'write', 'admin']]) {
    const ws = shared(permissions)
    const calls = []
    const context = {
      workspaceName: ws.id, cancelled: false, listWorkspaces: async () => [ws], canManageWorkspace,
      setWorkspace: workspace => { context.workspace = workspace },
      setLabel() {}, setDescription() {}, setColor() {}, setIcon() {}, setIsLoading() {},
      loadShares: async () => calls.push('shares'), loadRuntimeSettings: async () => calls.push('runtime'),
      showToast: assert.fail,
    }
    await evaluate(`${load.getText(file)}\nglobalThis.run = load`, context)()
    assert.equal(context.workspace, ws)
    assert.deepEqual(calls, permissions.includes('admin') ? ['shares', 'runtime'] : [])
  }
  const lazyTabs = effects.find(effect => effect.getText(file).includes('!dbTabSatisfiedRef.current'))
  for (const activeTab of ['db', 'devices']) {
    evaluate(`globalThis.run = ${lazyTabs.getText(file)}`, {
      canManage: false, activeTab, workspaceId: 'shared-id', workspace: { status: 'active' },
      dbTabSatisfiedRef: { current: false }, devicesTabSatisfiedRef: { current: false },
      loadDbStats: assert.fail, loadDevices: assert.fail,
    })()
  }
})

test('workspace frame titles resolve shared UUIDs without confusing same-named owned workspaces', () => {
  const file = source('components/shell/strip/StripShell.tsx')
  const fn = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'titleOf')
  const titleOf = evaluate(`${fn.getText(file)}\nglobalThis.run = titleOf`, { SETTINGS_GROUPS: [] })
  const workspaces = [{ id: 'own-id', name: 'team', label: 'My team' }, { ...shared(['read']), label: 'Company team' }]
  assert.equal(titleOf(null, '/workspaces/shared-id', workspaces), 'Company team')
  assert.equal(titleOf(null, '/workspaces/team', workspaces), 'My team')
  assert.equal(titleOf({ kind: 'route', location: '/workspaces/shared-id' }, '/', workspaces), 'Company team')
  assert.equal(titleOf(null, '/workspaces/shared-id', [shared(['read'])]), 'team', 'name is used when no label exists')
})
