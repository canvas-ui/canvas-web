import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const { outputText } = ts.transpileModule(readFileSync(new URL('../src/components/ui/toast-container.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
})
function harness() {
  const records = new Map(), calls = [], timers = []
  let account = 'alice', nextId = 0
  const dependencies = {
    react: { useState: value => [value, () => {}], useRef: current => ({ current }), useMemo: fn => fn(), useCallback: fn => fn },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    './toast': {}, 'lucide-react': {}, './use-toast': { ToastContext: { Provider: 'provider' } },
    '@/lib/connectivity': { isNetworkErrorMessage: text => text === 'Network Error' },
    '@/lib/notification-history': {
      notificationAccount: () => account,
      addLocalNotification: async (owner, item) => { calls.push(['add', owner, item.id]); if (!records.has(`${owner}:${item.id}`)) records.set(`${owner}:${item.id}`, { ...item }) },
      updateLocalNotification: async (owner, id, patch) => { calls.push(['update', owner, id]); const item = records.get(`${owner}:${id}`); if (item) Object.assign(item, patch) },
    },
  }
  const exports = {}
  vm.runInNewContext(outputText, { exports, require: name => dependencies[name], crypto: { randomUUID: () => String(++nextId) }, setTimeout: fn => timers.push(fn) })
  const api = exports.ToastContainer({}).props.value
  return { api, records, calls, expire: () => timers.splice(0).forEach(fn => fn()), switchAccount: owner => { account = owner } }
}

test('ordinary notices and errors archive once while duplicate popups are suppressed', () => {
  const h = harness()
  h.api.showToast({ title: 'Saved', description: 'file.txt' })
  h.api.showToast({ title: 'Saved', description: 'file.txt' })
  h.api.showToast({ title: 'Failed', variant: 'destructive' })
  assert.equal(h.records.size, 2)
  assert.deepEqual([...h.records.values()].map(n => n.status), ['info', 'error'])
  h.expire()
  h.api.showToast({ title: 'Saved', description: 'file.txt' })
  assert.equal(h.records.size, 3, 'a later distinct operation is retained')
  h.api.showToast({ title: 'Network Error' })
  assert.equal(h.records.size, 3, 'the persistent offline indicator does not spam history')
})

test('stable delivery IDs deduplicate repeated socket events without collapsing distinct messages', () => {
  const h = harness()
  for (const historyId of ['message:1', 'message:1', 'message:2']) h.api.showToast({ title: 'Notification', description: 'Finished', historyId, timestamp: '2026-10-15T10:00:00Z' })
  assert.equal(h.records.size, 2)
  assert.equal(h.records.get('alice:message:1').timestamp, '2026-10-15T10:00:00.000Z')
})

test('progress settles one existing record and keeps the account that started it', () => {
  const h = harness()
  const progress = h.api.showProgress({ title: 'Copying files' })
  assert.equal(h.records.get('alice:1').status, 'started')
  h.switchAccount('bob')
  progress.done({ title: 'Copied', description: '3 files copied' })
  progress.fail({ title: 'A late failure must be ignored' })
  assert.equal(h.records.size, 1)
  assert.equal(h.records.get('alice:1').status, 'completed')
  assert.equal(h.records.get('alice:1').text, '3 files copied')
  assert.equal(h.calls.filter(c => c[0] === 'update').length, 1)
})

test('silent completion and failure both remain reviewable', () => {
  const h = harness()
  h.api.showProgress({ title: 'Uploading' }).done()
  h.api.showProgress({ title: 'Saving' }).fail({ title: 'Save failed', description: 'Disk full' })
  assert.equal(h.records.get('alice:1').status, 'completed')
  assert.equal(h.records.get('alice:2').status, 'error')
  assert.equal(h.records.get('alice:2').text, 'Disk full')
})
