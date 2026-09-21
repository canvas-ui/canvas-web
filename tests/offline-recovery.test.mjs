import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load(path, dependencies, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
  const exports = {}
  vm.runInNewContext(outputText, { exports, require: name => {
    assert.ok(name in dependencies, `Unexpected import ${name}`)
    return dependencies[name]
  }, console: { error() {} }, setTimeout, clearTimeout, ...globals })
  return exports
}

// Render the hooks through state/effect cycles, including failed async loads.
// A bounded render count makes the original loading -> effect -> loading loop fail.
for (const kind of ['Workspace', 'Context', 'Agent']) {
  test(`${kind} load settles after failure, deduplicates refresh, and recovers on connect`, async () => {
    const slots = []
    let cursor = 0, dirty = false, effects = [], calls = 0, fail = true
    const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
    const react = {
      useState(initial) {
        const i = cursor++
        slots[i] ??= { value: initial }
        return [slots[i].value, next => {
          const value = typeof next === 'function' ? next(slots[i].value) : next
          if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true }
        }]
      },
      useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } },
      useMemo(fn, deps) {
        const i = cursor++
        if (!same(slots[i]?.deps, deps)) slots[i] = { value: fn(), deps }
        return slots[i].value
      },
      useCallback(fn, deps) { return react.useMemo(() => fn, deps) },
      useEffect(fn, deps) {
        const i = cursor++
        if (!same(slots[i]?.deps, deps)) {
          effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() } })
        }
      },
    }
    const handlers = new Map()
    const socket = { emit() {}, on(e, fn) { handlers.set(e, fn); return () => handlers.delete(e) }, off(e) { handlers.delete(e) } }
    const plural = `${kind.toLowerCase()}s`
    const mod = load(`../src/hooks/use${kind}ListData.ts`, {
      react,
      [`@/services/${kind.toLowerCase()}`]: { [`list${kind}s`]: async () => {
        calls++
        if (fail) throw new Error('Network error: offline')
        return [{ id: 'recovered' }]
      } },
      '@/lib/socket': { default: socket },
      '@/lib/list-order': { sortByOrder: value => value },
    }, { window: { addEventListener() {}, removeEventListener() {} } })
    let result
    async function settle() {
      for (let renders = 0; renders < 20; renders++) {
        dirty = false; cursor = 0; effects = []
        result = mod[`use${kind}ListData`](true)
        effects.forEach(fn => fn())
        // Flush synchronous loading renders before the request settles.
        if (!dirty) await new Promise(resolve => setImmediate(resolve))
        if (!dirty) return
      }
      assert.fail('Load never settled: render-driven retry loop')
    }
    await settle()
    assert.equal(calls, 1)
    assert.equal(result.isLoading, false)
    result.refresh(); result.refresh()
    await settle()
    assert.equal(calls, 2)
    fail = false
    handlers.get('connect')()
    await settle()
    assert.equal(calls, 3)
    assert.equal(result[plural][0].id, 'recovered')
  })
}

test('socket failures keep one backoff manager, restore subscriptions, and stop on logout', async () => {
  const sockets = []
  const { socketService } = load('../src/lib/socket.ts', {
    '@/config/api': { WS_URL: 'http://test' },
    'socket.io-client': { io(url, options) {
      const listeners = new Map()
      const socket = {
        options, sent: [], connects: 0, stopped: false,
        on(e, fn) { const list = listeners.get(e) || []; list.push(fn); listeners.set(e, list) },
        off(e, fn) { listeners.set(e, (listeners.get(e) || []).filter(f => f !== fn)) },
        fire(e) { for (const fn of [...(listeners.get(e) || [])]) fn() },
        emit(...args) { this.sent.push(args) },
        connect() { this.connects++ },
        disconnect() { this.stopped = true; this.fire('disconnect') },
        removeAllListeners() { listeners.clear() },
      }
      sockets.push(socket)
      return socket
    } },
  }, { localStorage: { getItem: () => 'token' } })
  let connected = 0
  socketService.on('connect', () => connected++)
  socketService.emit('subscribe', { channel: 'workspace' })
  const first = sockets[0]
  for (let i = 0; i < 100; i++) {
    first.fire('connect_error')
    socketService.reconnect()
    socketService.emit('subscribe', { channel: 'workspace' })
  }
  assert.equal(sockets.length, 1)
  assert.equal(first.connects, 1)
  assert.equal(first.options.reconnectionAttempts, Infinity)
  assert.equal(first.options.reconnectionDelayMax, 30000)
  await assert.rejects(socketService.request('query'), /Socket not connected/)
  first.fire('connect')
  assert.equal(connected, 1)
  assert.equal(first.sent.length, 1)
  first.fire('disconnect')
  first.fire('connect')
  assert.equal(connected, 2)
  assert.equal(first.sent.length, 2)
  socketService.connect('new-token')
  assert.equal(first.stopped, true)
  assert.equal(sockets.length, 2)
  socketService.disconnect()
  assert.equal(sockets[1].stopped, true)
  socketService.connect()
  sockets[2].fire('connect')
  assert.equal(sockets[2].sent.length, 0)
})

test('connection checks bypass cache, coalesce retries, and keep cached responses offline', async () => {
  let offline = true, recovered = 0, calls = 0, resolveFetch
  const timers = new Map(), listeners = new Set(), events = new Map()
  const setOffline = value => {
    if (offline === value) return
    offline = value
    listeners.forEach(fn => fn(value))
  }
  const { createConnectionMonitor } = load('../src/lib/connection-monitor.ts', {
    './connectivity': {
      isOffline: () => offline,
      reportNetworkFailure: () => setOffline(true),
      reportNetworkSuccess: () => setOffline(false),
      onConnectivityChange(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    },
  }, {
    AbortController,
    window: { addEventListener(e, fn) { events.set(e, fn) }, removeEventListener(e) { events.delete(e) } },
    setTimeout(fn, delay) { const key = {}; timers.set(key, { fn, delay }); return key },
    clearTimeout(key) { timers.delete(key) },
    fetch: (url, options) => {
      calls++
      assert.equal(url, '/rest/v2/ping')
      assert.equal(options.cache, 'no-store')
      return new Promise(resolve => { resolveFetch = resolve })
    },
  })
  const monitor = createConnectionMonitor('/rest/v2/ping', () => recovered++)
  assert.ok([...timers.values()].some(t => t.delay === 30000))
  const first = monitor.retry()
  assert.equal(monitor.retry(), first)
  resolveFetch({ ok: true, headers: new Headers({ 'x-canvas-offline': 'fallback' }) })
  assert.equal(await first, false)
  assert.equal(offline, true)
  assert.equal(recovered, 0)
  const second = monitor.retry(true)
  resolveFetch({ ok: true, headers: new Headers(), json: async () => ({ status: 'success' }) })
  assert.equal(await second, true)
  assert.equal(offline, false)
  assert.equal(recovered, 1)
  assert.equal(timers.size, 0)
  // A socket-only failure with healthy HTTP must not restart its backoff.
  const third = monitor.retry()
  resolveFetch({ ok: true, headers: new Headers(), json: async () => ({ status: 'success' }) })
  await third
  assert.equal(recovered, 1)
  assert.equal(calls, 3)
  monitor.stop()
  assert.equal(events.size, 0)
  assert.equal(listeners.size, 0)
})
