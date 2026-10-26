import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { buildAutoLinkRules } from '../src/lib/auto-link.ts'

const tick = () => new Promise(resolve => setImmediate(resolve))

test('Auto-Link displays scan totals, uses the saved batch size and resumes a failed batch', async () => {
  const slots = [], calls = [], pending = []
  let cursor = 0
  const jsx = (type, props) => ({ type, props })
  const dependencies = {
    react: { useEffect() {}, useState(initial) {
      const index = cursor++
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }]
    } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'lucide-react': {},
    '@/components/ui/button': { Button: 'Button' },
    './LinkToCard': { LinkToCard: 'LinkToCard' },
    '@/components/common/document-action-dialog': { DocumentActionDialog: 'Dialog' },
    '@/lib/auto-link': { buildAutoLinkRules },
    '@/services/hooks': {
      getBackfillLimit: () => 2,
      addAutoLinkRule: async () => {},
      backfillHook: async (_workspace, body) => {
        calls.push(body)
        if (body.dryRun) return { total: 4, processed: 1, matched: 1, failed: 0, nextOffset: body.offset + 1 }
        return new Promise((resolve, reject) => pending.push({ resolve, reject }))
      },
    },
    '@/services/workspace': {},
    '@/lib/backend-upload': {},
  }
  const exports = {}
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/menu/shared/AutoLinkFolderPanel.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => {
    assert.ok(name in dependencies, `Unexpected import ${name}`)
    return dependencies[name]
  }, crypto: { randomUUID: () => 'test' }, window: { dispatchEvent() {} }, CustomEvent: class {} })

  const render = () => { cursor = 0; return exports.AutoLinkFolderPanel({ workspaceId: 'work', sourcePath: '/workspace/home/photos', onClose() {}, onManageRules() {} }) }
  const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : []
  const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : ''
  const button = label => nodes(render()).find(node => node.type === 'Button' && text(node) === label)
  button('Add virtual path…').props.onClick()
  nodes(render()).find(node => node.type === 'LinkToCard').props.onConfirm(['/photos'], { treeType: 'context' })

  const run = button('Enable Autolink').props.onClick()
  await tick()
  assert.match(text(render()), /Processing 0\/4 existing documents/)
  assert.equal(calls.at(-1).limit, 2)
  pending.shift().resolve({ total: 4, processed: 2, matched: 1, failed: 0, nextOffset: 2 })
  await tick()
  assert.match(text(render()), /Processing 2\/4 existing documents… 1 matches applied/)
  pending.shift().reject(new Error('Connection interrupted'))
  await run
  const retry = button('Retry existing documents').props.onClick()
  await tick()
  assert.equal(calls.at(-1).offset, 2, 'retry must resume after the completed batch')
  assert.match(text(render()), /Processing 2\/4 existing documents/)
  pending.shift().resolve({ total: 4, processed: 2, matched: 2, failed: 1, nextOffset: null })
  await retry
  assert.match(text(render()), /4 documents checked\. 2 matches applied/)
  assert.match(text(render()), /1 document operations failed/)
  assert.ok(button('Done'))
})
