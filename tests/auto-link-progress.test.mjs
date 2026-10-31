import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { buildAutoLinkRules } from '../src/lib/auto-link.ts'

const tick = () => new Promise(resolve => setImmediate(resolve))

const load = (file, dependencies, globals = {}) => {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => {
    assert.ok(name in dependencies, `Unexpected import ${name}`)
    return dependencies[name]
  }, ...globals })
  return exports
}

function runner(hooks) {
  const notices = [], listeners = new Map(), subscribed = []
  const socketService = {
    on(event, handler) { listeners.set(event, [...(listeners.get(event) || []), handler]); return () => socketService.off(event, handler) },
    off(event, handler) { listeners.set(event, (listeners.get(event) || []).filter(entry => entry !== handler)) },
    emit(event, payload) { if (event === 'subscribe') subscribed.push(payload.channel) },
  }
  const fire = (event, payload) => (listeners.get(event) || []).forEach(handler => handler(payload))
  const showProgress = toast => {
    notices.push(['start', toast])
    return { update: t => notices.push(['update', t]), done: t => notices.push(['done', t]), fail: t => notices.push(['fail', t]) }
  }
  const service = load('../src/services/rule-backfill.ts', { '@/lib/socket': { socketService }, './hooks': { getBackfillLimit: () => 2, ...hooks } }, {
    Error, Map, Promise, String, CustomEvent: class {}, window: { dispatchEvent() {} },
  })
  return { notices, showProgress, fire, listeners, subscribed, ...service }
}
const job = fields => ({ id: 'j1', ruleIds: ['a'], status: 'running', ruleIndex: 0, processed: 0, total: null, checked: 0, applied: 0, skipped: 0, failed: 0, error: null, ...fields })

test('the notice follows job events, ignores other jobs and stops listening when finished', async () => {
  const running = job({ ruleIds: ['a', 'b'] })
  let started
  const { notices, showProgress, fire, listeners, subscribed, startRuleBackfill } = runner({
    startBackfillJob: async (_workspace, body) => { started = body; return running },
    getBackfillJob: async () => running,
  })
  const run = startRuleBackfill(showProgress, 'work', ['a', 'b'])
  await tick()
  assert.equal(started.limit, 2)
  assert.equal(subscribed[0], 'workspace:work')
  fire('job.progress', { job: job({ id: 'other', processed: 99 }) })
  fire('job.progress', { job: job({ ruleIds: ['a', 'b'], processed: 2, total: 3, applied: 2 }) })
  assert.ok(notices.some(([kind, toast]) => kind === 'update' && /Rule 1\/2: 2 \/ 3 documents · 2 applied/.test(toast.description)))
  assert.ok(!notices.some(([, toast]) => /99/.test(toast.description || '')))
  fire('job.finished', { job: job({ ruleIds: ['a', 'b'], status: 'done', checked: 6, applied: 3, skipped: 1, failed: 2 }) })
  await run
  const [kind, result] = notices.at(-1)
  assert.equal(kind, 'done')
  assert.equal(result.variant, 'destructive')
  assert.match(result.description, /6 checked, 3 applied, 1 already there, 2 failed/)
  assert.deepEqual(listeners.get('job.progress'), [])
  assert.deepEqual(listeners.get('connect'), [])
})

test('skipped documents alone finish cleanly, and Cancel asks the server to stop', async () => {
  const cancelled = []
  const { notices, showProgress, fire, startRuleBackfill } = runner({
    startBackfillJob: async () => job(),
    getBackfillJob: async () => job(),
    cancelBackfillJob: async (_workspace, id) => { cancelled.push(id); return job() },
  })
  const run = startRuleBackfill(showProgress, 'work', ['a'])
  await tick()
  notices[0][1].action.onClick()
  assert.deepEqual(cancelled, ['j1'])
  assert.equal(notices.at(-1)[1].title, 'Cancelling…')
  fire('job.finished', { job: job({ status: 'cancelled', checked: 2, applied: 1, skipped: 1 }) })
  await run
  const [kind, result] = notices.at(-1)
  assert.deepEqual([kind, result.title, result.variant], ['done', 'Cancelled', undefined])
})

test('a reload picks running jobs up, and a socket reconnect catches up on a missed finish', async () => {
  let poll = job({ processed: 5, total: 9 })
  const { notices, showProgress, fire, resumeRuleBackfills } = runner({
    listBackfillJobs: async () => [job({ id: 'old', status: 'done' }), job({ processed: 5, total: 9 })],
    getBackfillJob: async () => poll,
  })
  await resumeRuleBackfills(showProgress, 'work')
  await tick()
  assert.equal(notices.filter(([kind]) => kind === 'start').length, 1)
  assert.match(notices[0][1].description, /5 \/ 9 documents/)
  poll = job({ status: 'failed', checked: 5, applied: 5, error: 'db closed' })
  fire('connect')
  await tick()
  const [kind, result] = notices.at(-1)
  assert.equal(kind, 'fail')
  assert.match(result.description, /5 checked, 5 applied: db closed/)
})

test('a run that cannot start says so instead of throwing', async () => {
  const { notices, showProgress, startRuleBackfill } = runner({ startBackfillJob: async () => { throw new Error('Rule not found') } })
  await startRuleBackfill(showProgress, 'work', ['a'])
  assert.equal(notices.at(-1)[0], 'fail')
  assert.match(notices.at(-1)[1].description, /Rule not found/)
})

test('enabling Autolink hands existing documents to the server job and closes', async () => {
  const slots = [], order = []
  let cursor = 0, closed = 0
  const jsx = (type, props) => ({ type, props })
  const { AutoLinkFolderPanel } = load('../src/components/menu/shared/AutoLinkFolderPanel.tsx', {
    react: { useEffect() {}, useState(initial) {
      const index = cursor++
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }]
    } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'lucide-react': {},
    '@/components/ui/button': { Button: 'Button' },
    '@/components/ui/use-toast': { useToast: () => ({ showToast() {}, showProgress() {} }) },
    './LinkToCard': { LinkToCard: 'LinkToCard' },
    '@/components/common/document-action-dialog': { DocumentActionDialog: 'Dialog' },
    '@/lib/auto-link': { buildAutoLinkRules },
    '@/services/hooks': { addAutoLinkRule: async () => { order.push('saved') } },
    '@/services/rule-backfill': { startRuleBackfill: (_progress, workspace, ids) => {
      order.push(`backfill:${workspace}:${ids.length}`)
      return new Promise(() => {}) // still running when the panel closes
    } },
    '@/services/workspace': {},
    '@/lib/backend-upload': {},
  }, { crypto: { randomUUID: () => 'test' } })

  const render = () => { cursor = 0; return AutoLinkFolderPanel({ workspaceId: 'work', sourcePath: '/workspace/home/photos', onClose() { closed++ }, onManageRules() {} }) }
  const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : []
  const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : ''
  const button = label => nodes(render()).find(node => node.type === 'Button' && text(node) === label)
  button('Add virtual path…').props.onClick()
  nodes(render()).find(node => node.type === 'LinkToCard').props.onConfirm(['/photos'], { treeType: 'context' })
  await button('Enable Autolink').props.onClick()
  assert.deepEqual(order, ['saved', 'backfill:work:1'])
  assert.equal(closed, 1)
})
