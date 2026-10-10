import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

test('content survives navigation and refreshes but hides on stop or workspace switch', async () => {
  const slots = []
  let cursor = 0
  let effects = []
  const events = new Map()
  const requests = []
  let poll
  let offline = false
  const socketEvents = new Map()
  const connectivityListeners = new Set()
  const location = { key: 'first' }
  let workspaceName = 'private'
  const react = {
    useState(initial) {
      const index = cursor++
      slots[index] ??= { value: initial }
      return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }]
    },
    useEffect(fn, deps) {
      const index = cursor++
      if (!slots[index] || deps.some((value, i) => value !== slots[index].deps[i])) {
        effects.push(() => {
          slots[index]?.cleanup?.()
          slots[index] = { deps, cleanup: fn() }
        })
      }
    },
  }
  const jsx = (type, props) => ({ type, props })
  const dependencies = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-router-dom': { useLocation: () => location, Link: 'link' },
    '@/services/workspace': {
      getWorkspace: () => new Promise((resolve, reject) => requests.push(Object.assign(resolve, { reject, kind: 'metadata' }))),
      getWorkspaceStatus: () => new Promise((resolve, reject) => requests.push(Object.assign(resolve, { reject, kind: 'status' }))),
      startWorkspace: async () => {},
    },
    '@/lib/socket': { default: {
      on: (name, fn) => { socketEvents.set(name, fn); return () => socketEvents.delete(name) },
      off: name => socketEvents.delete(name),
    } },
    '@/lib/connectivity': {
      isOffline: () => offline, isNetworkErrorMessage: message => /Network error:/i.test(message),
      onConnectivityChange: fn => { connectivityListeners.add(fn); return () => connectivityListeners.delete(fn) },
    },
    '@/components/ui/button': { Button: 'button' },
  }
  const source = readFileSync(new URL('../src/components/workspace/workspace-content-gate.tsx', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } })
  const exports = {}
  vm.runInNewContext(outputText, { exports, Error, require: name => dependencies[name], window: {
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: name => events.delete(name),
    setInterval: () => assert.fail('Workspace metadata must not be polled'),
  } })
  const content = { sensitive: 'cached preview' }
  const render = () => {
    cursor = 0
    effects = []
    const result = exports.WorkspaceContentGate({ workspaceName, children: content })
    effects.forEach(fn => fn())
    return result
  }
  const settle = async status => { requests.shift()({ status, id: 'workspace-uuid' }); await new Promise(resolve => setImmediate(resolve)) }
  poll = () => socketEvents.get('connect')()
  assert.notEqual(render(), content)
  await settle('inactive')
  assert.notEqual(render(), content)
  poll()
  await settle('active')
  assert.equal(render(), content)
  events.get('focus')()
  events.get('focus')()
  assert.equal(requests.length, 1, 'concurrent status checks are coalesced')
  assert.equal(requests[0].kind, 'status', 'focus does not reload the full workspace')
  assert.equal(render(), content, 'focus must retain mounted content while checking status')
  await settle('active')
  assert.equal(render(), content, 'an active focus response must not remount content')
  poll()
  requests.shift().reject(new Error('Network error: server unreachable'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(render(), content, 'a network failure must preserve mounted cached readers')
  events.get('focus')()
  assert.equal(render(), content)
  await settle('inactive')
  assert.notEqual(render(), content, 'focus still hides a workspace stopped elsewhere')
  poll()
  await settle('active')
  assert.equal(render(), content)
  location.key = 'folder-navigation'
  assert.equal(render(), content, 'folder navigation retains the content subtree')
  assert.equal(requests.length, 0, 'navigation does not refetch workspace status')
  location.key = 'back-navigation'
  assert.equal(render(), content, 'back navigation within a workspace retains content')
  socketEvents.get('workspace.status.changed')({ workspaceId: 'unrelated', status: 'inactive' })
  assert.equal(render(), content)
  socketEvents.get('workspace.status.changed')({ workspaceId: 'workspace-uuid', status: 'inactive' })
  assert.notEqual(render(), content, 'a live lifecycle event hides stopped content without a GET')
  socketEvents.get('workspace:status:changed')({ workspaceId: 'workspace-uuid', status: 'active' })
  assert.equal(render(), content)
  assert.equal(requests.length, 0)
  events.get('workspaces:refresh')()
  assert.equal(render(), content, 'list refresh does not clear active status')
  await settle('active')
  assert.equal(render(), content)
  poll()
  offline = true
  await settle('inactive')
  assert.equal(render(), content, 'cached inactive status must not block offline readers')
  offline = false
  connectivityListeners.forEach(fn => fn(false))
  await settle('inactive')
  assert.notEqual(render(), content, 'a live stopped status remains authoritative after recovery')
  poll()
  await settle('active')
  assert.equal(render(), content)
  events.get('workspace:stopped')({ detail: { refs: ['unrelated'] } })
  assert.equal(render(), content, 'stopping another workspace does not affect this one')
  poll()
  events.get('workspace:stopped')({ detail: { refs: ['workspace-uuid'] } })
  assert.notEqual(render(), content, 'a matching stop immediately hides content')
  await settle('active')
  assert.notEqual(render(), content, 'a request predating the stop cannot reopen content')
  events.get('workspaces:refresh')()
  assert.notEqual(render(), content)
  await settle('inactive')
  assert.notEqual(render(), content)
  poll()
  await settle('active')
  assert.equal(render(), content)
  poll() // Response from the old navigation is still pending.
  workspaceName = 'other-workspace'
  assert.notEqual(render(), content, 'switching workspaces requires a fresh status check')
  await settle('active')
  assert.notEqual(render(), content)
  await settle('inactive')
  assert.notEqual(render(), content)
  poll()
  requests.shift().reject(new Error('Network error: server unreachable'))
  await new Promise(resolve => setImmediate(resolve))
  assert.match(JSON.stringify(render()), /Server unreachable/)
  assert.doesNotMatch(JSON.stringify(render()), /Start workspace|Workspace stopped/)
  poll()
  requests.shift().reject(new Error('Access denied'))
  await new Promise(resolve => setImmediate(resolve))
  assert.match(JSON.stringify(render()), /Workspace unavailable/)
  assert.doesNotMatch(JSON.stringify(render()), /Start workspace|Server unreachable/)
  workspaceName = 'cached-workspace'
  assert.notEqual(render(), content)
  offline = true
  await settle('inactive')
  assert.equal(render(), content, 'cold offline navigation can use cached workspace metadata')
})
