import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const { outputText } = ts.transpileModule(readFileSync(new URL('../src/components/toolbox/applets/FiltersApplet.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
})

function render(target, toolbox = null) {
  const events = [], effects = []
  let reconnect
  const dependencies = {
    react: { useEffect: effect => effects.push(effect) },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    '@/lib/socket': { default: {
      emit: (event, payload) => events.push([event, payload.channel]),
      on: (_, fn) => { reconnect = fn; return () => { reconnect = null } },
    } },
    '../toolbox-context': { ToolboxProvider: 'toolbox-provider' },
    '../use-toolbox': { useToolboxOptional: () => toolbox },
    '../panels/ToolsPanel': { ToolsPanel: 'filters' },
    './use-applet-target': { useAppletTarget: () => target },
    '../lens-feed-context': { LensFeedProvider: 'lens-provider' },
  }
  const exports = {}
  vm.runInNewContext(outputText, { exports, require: name => dependencies[name] })
  const view = exports.FiltersApplet()
  const cleanup = effects.map(effect => effect()).filter(Boolean)
  return { view, events, reconnect: () => reconnect?.(), cleanup: () => cleanup.forEach(fn => fn()) }
}

test('standalone filters subscribe to the bound context, resubscribe, and release it on exit', () => {
  const ui = render({ mode: 'context', contextId: 'design' })
  assert.equal(ui.view.type, 'toolbox-provider')
  assert.equal(ui.view.props.children.type, 'lens-provider', 'Lens must see the bound toolbox provider')
  assert.deepEqual(ui.events, [['subscribe', 'context:design']])
  ui.reconnect()
  ui.cleanup()
  assert.deepEqual(ui.events, [['subscribe', 'context:design'], ['subscribe', 'context:design'], ['unsubscribe', 'context:design']])
})

test('embedded filters reuse the host state and do not release its subscription', () => {
  const ui = render({ mode: 'context', contextId: 'design' }, { state: { activeContextType: 'context', activeContextId: 'design' } })
  assert.equal(ui.view.type, 'filters')
  ui.cleanup()
  assert.deepEqual(ui.events, [])
})


test('an app tab bound to another path gets its own filters instead of changing the focused pane', () => {
  const target = { mode: 'workspace', workspaceName: 'Studio', treeName: 'directory', path: '/Sketches' }
  const host = { state: { activeContextType: 'canvas', activeWorkspaceName: 'Studio', activeTreeName: 'directory', activeContextPath: '/Notes' } }
  const separate = render(target, host)
  assert.equal(separate.view.type, 'toolbox-provider')
  assert.equal(separate.view.props.target, target)
  separate.cleanup()
  const shared = render({ ...target, path: '/Notes' }, host)
  assert.equal(shared.view.type, 'filters')
  shared.cleanup()
})
