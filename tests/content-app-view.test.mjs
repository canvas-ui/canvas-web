import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const { outputText } = ts.transpileModule(readFileSync(new URL('../src/components/common/content-app-view.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
})
const applets = ['todo', 'notes', 'sketch', 'filters', 'lens'].map(id => ({ id, Component: () => id }))
const exports = {}
vm.runInNewContext(outputText, { exports, require: name => ({
  'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
  '@/components/toolbox/applets/registry': { APPLETS: applets },
  '@/components/toolbox/applets/applet-target': { AppletTargetProvider: 'target' },
}[name] ?? {}) })

test('Todo App and Notes App reuse the Toolbox components bound to the tab path or context', () => {
  for (const [app, applet] of [['todo-app', 'todo'], ['notes-app', 'notes'], ['sketch', 'sketch']]) {
    for (const contextId of [undefined, 'design']) {
      const view = exports.ContentAppView({ app, contextId, workspaceId: 'studio', treeName: 'directory', path: '/Projects' })
      assert.equal(view.type, 'target')
      assert.equal(view.props.children.type, applets.find(item => item.id === applet).Component)
      const target = JSON.parse(JSON.stringify(view.props.target))
      assert.deepEqual(target, contextId ? { mode: 'context', contextId } : {
        mode: 'workspace', workspaceName: 'studio', treeName: 'directory', path: '/Projects', treeType: 'directory',
      })
    }
  }
  const list = exports.ContentAppView({ app: 'todos', workspaceId: 'studio', treeName: 'directory', path: '/Projects' })
  assert.notEqual(list.props.children.type, applets.find(item => item.id === 'todo').Component)
})
