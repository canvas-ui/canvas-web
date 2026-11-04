import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/pages/workspaces/[workspaceName]/settings.tsx', import.meta.url), 'utf8')
function form(name, backend) {
  const ast = ts.createSourceFile('settings.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
  const slots = [], calls = []
  let cursor = 0
  const jsx = (type, props) => ({ type, props })
  const exports = {}
  vm.runInNewContext(ts.transpileModule(`${declaration.getText(ast)}\nexports.form = ${name}`, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText, {
    exports, require: () => ({ jsx, jsxs: jsx }),
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next }] },
    useToast: () => ({ showToast() {} }),
    updateBackend: async (...args) => calls.push(args), addBackend: async () => { throw Error('Must update existing backend') },
    Button: 'button', Input: 'input', Toggle: 'toggle', Icon: 'icon', FolderPlus: 'icon', GoogleOAuthButton: 'oauth',
  })
  const render = () => { cursor = 0; return exports.form({ workspaceId: 'ws', backend, onAdded() {} }) }
  render().props.onClick()
  return { render, calls }
}
const flatten = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(flatten)]

test('failed Google Drive mount can replace its refresh token without clearing stored secret', async () => {
  const ui = form('GoogleDriveForm', { driver: 'gdrive', address: 'drive', status: 'error', config: { label: 'Drive', clientId: 'client', clientSecret: true, refreshToken: true, folderId: 'root' } })
  const inputs = flatten(ui.render()).filter(node => node.type === 'input')
  inputs[4].props.onChange({ target: { value: 'new-token' } })
  await ui.render().props.onSubmit({ preventDefault() {} })
  const [workspace, driver, address, patch] = ui.calls[0]
  assert.deepEqual([workspace, driver, address], ['ws', 'gdrive', 'drive'])
  assert.equal(patch.refreshToken, 'new-token')
  assert.equal('clientSecret' in patch, false)
  assert.equal(patch.clientId, 'client')
})

test('existing local backend updates its configuration in place', async () => {
  const ui = form('LocalFolderForm', { driver: 'file', address: 'folder', config: { label: 'Files', root: '/mnt/files', readOnly: true } })
  await ui.render().props.onSubmit({ preventDefault() {} })
  assert.equal(ui.calls[0][2], 'folder')
  assert.equal(ui.calls[0][3].root, '/mnt/files')
  assert.equal(ui.calls[0][3].readOnly, true)
})
