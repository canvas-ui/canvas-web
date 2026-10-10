import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function setup() {
  const slots = [], handlers = new Map(), events = new Map(), requests = []
  let cursor = 0, effects = [], calls = 0
  const react = {
    useState(initial) {
      const index = cursor++
      slots[index] ??= { value: initial }
      return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }]
    },
    useEffect(fn, deps) {
      const index = cursor++
      if (!slots[index] || deps.some((value, i) => value !== slots[index].deps[i])) {
        effects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: fn() } })
      }
    },
  }
  const socket = {
    on(name, fn) { handlers.set(name, fn); return () => handlers.delete(name) },
    off(name) { handlers.delete(name) },
  }
  const jsx = (type, props) => ({ type, props })
  const dependencies = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'lucide-react': { Loader2: 'loader', X: 'x' },
    '@/lib/socket': { default: socket },
    '@/services/workspace': { listBackends: () => {
      calls++
      return new Promise((resolve, reject) => requests.push({ resolve, reject }))
    } },
  }
  const exports = {}
  const source = readFileSync(new URL('../src/components/notifications/StorageScanIndicator.tsx', import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, require: name => dependencies[name],
    setInterval() { assert.fail('Idle scan indicators must not poll') },
    window: { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) },
  })
  return {
    requests, get calls() { return calls },
    render() {
      cursor = 0; effects = []
      const result = exports.StorageScanIndicator({ workspaceId: 'ws-1', workspaceName: 'Universe' })
      effects.forEach(fn => fn())
      return result
    },
    emit(name, payload) { handlers.get(name)?.(payload) },
    async settle(backends) { requests.shift().resolve(backends); await new Promise(resolve => setImmediate(resolve)) },
    stop() { slots.forEach(slot => slot?.cleanup?.()); assert.equal(events.size, 0); assert.equal(handlers.size, 0) },
  }
}
const backend = resyncing => ({ address: 'workspace:home', resyncing, config: { label: 'Home' }, progress: { scanned: 0, total: 100 } })
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : Array.isArray(node) ? node.map(text).join('') : text(node?.props?.children || '')

test('idle indicators do not poll, and progress updates render without backend requests', async () => {
  const ui = setup()
  assert.equal(ui.render(), null)
  await ui.settle([backend(false)])
  assert.equal(ui.render(), null)
  ui.emit('backend.resync.changed', { workspaceId: 'other', backend: 'workspace:home', resyncing: true })
  assert.equal(ui.render(), null)
  for (let scanned = 1; scanned <= 100; scanned++) {
    ui.emit('backend.resync.changed', { workspaceId: 'ws-1', backend: 'workspace:home', resyncing: true, progress: { scanned, total: 100 } })
    ui.render()
  }
  assert.equal(ui.calls, 1)
  assert.match(text(ui.render()), /Home100 \/ 100/)
  ui.emit('backend.resync.changed', { workspaceId: 'ws-1', backend: 'workspace:home', resyncing: false })
  assert.equal(ui.render(), null)
  assert.equal(ui.calls, 1)
  ui.stop()
})

test('reconnect and backend edits reconcile once, and delayed snapshots cannot undo completion', async () => {
  const ui = setup()
  ui.render()
  await ui.settle([backend(false)])
  ui.render()
  ui.emit('backend.changed', { workspaceId: 'other' })
  assert.equal(ui.calls, 1)
  ui.emit('backend.changed', { workspaceId: 'ws-1' })
  await ui.settle([backend(true)])
  assert.notEqual(ui.render(), null)
  ui.emit('connect')
  assert.equal(ui.calls, 3)
  ui.emit('backend.resync.changed', { workspaceId: 'ws-1', backend: 'workspace:home', resyncing: false })
  await ui.settle([backend(true)])
  assert.equal(ui.render(), null, 'the pre-completion snapshot must not restart the indicator')
  ui.stop()
})
