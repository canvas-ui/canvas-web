import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

test('content stays unmounted until active, hides on stop/navigation, and ignores stale responses', async () => {
  const slots = []
  let cursor = 0
  let effects = []
  const events = new Map()
  const requests = []
  let poll
  const location = { key: 'first' }
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
    '@/services/workspace': { getWorkspace: () => new Promise(resolve => requests.push(resolve)), startWorkspace: async () => {} },
    '@/components/ui/button': { Button: 'button' },
  }
  const source = readFileSync(new URL('../src/components/workspace/workspace-content-gate.tsx', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } })
  const exports = {}
  vm.runInNewContext(outputText, { exports, require: name => dependencies[name], window: {
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: name => events.delete(name),
    setInterval: fn => { poll = fn; return 1 }, clearInterval() {},
  } })
  const content = { sensitive: 'cached preview' }
  const render = () => {
    cursor = 0
    effects = []
    const result = exports.WorkspaceContentGate({ workspaceName: 'private', children: content })
    effects.forEach(fn => fn())
    return result
  }
  const settle = async status => { requests.shift()({ status }); await new Promise(resolve => setImmediate(resolve)) }
  assert.notEqual(render(), content)
  await settle('inactive')
  assert.notEqual(render(), content)
  poll()
  await settle('active')
  assert.equal(render(), content)
  events.get('workspaces:refresh')()
  assert.notEqual(render(), content)
  await settle('inactive')
  assert.notEqual(render(), content)
  poll()
  await settle('active')
  assert.equal(render(), content)
  poll() // Response from the old navigation is still pending.
  location.key = 'back-navigation'
  assert.notEqual(render(), content)
  await settle('active')
  assert.notEqual(render(), content)
  await settle('inactive')
  assert.notEqual(render(), content)
})
