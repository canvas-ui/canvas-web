import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { createRequire } from 'node:module'
import { createRoutesFromChildren, matchRoutes } from 'react-router-dom'

const require = createRequire(import.meta.url)
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText

test('the document-by-ID URL and direct alias match a detail page rather than a folder view', () => {
  const exports = {}
  vm.runInNewContext(compile('../src/routes/shell-routes.tsx'), { exports, require: name =>
    name === 'react-router-dom' || name === 'react/jsx-runtime' ? require(name) : { default: name },
  })
  const routes = createRoutesFromChildren(exports.shellRoutes)
  for (const url of ['/workspaces/preprod/documents/by-id/101140', '/workspaces/preprod/documents/101140']) {
    const match = matchRoutes(routes, url).at(-1)
    assert.equal(match.params.documentId, '101140')
    assert.equal(match.route.element.type, '@/pages/workspaces/[workspaceName]/document')
  }
  for (const kind of ['by-hash', 'by-checksum']) {
    const match = matchRoutes(routes, `/workspaces/preprod/documents/${kind}/sha256/abc123`).at(-1)
    assert.equal(match.params.algo, 'sha256')
    assert.equal(match.params.checksum, 'abc123')
    assert.equal(match.route.element.type, '@/pages/workspaces/[workspaceName]/document')
  }
})

function setup() {
  const slots = [], requests = []
  let cursor = 0, effects = [], params = { workspaceName: 'preprod', documentId: '101140' }
  const react = {
    useState(initial) {
      const index = cursor++; slots[index] ??= { value: initial }
      return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }]
    },
    useEffect(fn, deps) {
      const index = cursor++
      if (!slots[index] || deps.some((value, i) => value !== slots[index].deps[i])) {
        effects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: fn() } })
      }
    },
  }
  const jsx = (type, props) => ({ type, props })
  const dependencies = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-router-dom': { useParams: () => params, Link: 'link' },
    '@/components/object-card/ObjectPropertiesCard': { ObjectPropertiesCard: 'card' },
    '@/components/workspace/workspace-content-gate': { WorkspaceContentGate: 'gate' },
    '@/components/ui/button': { Button: 'button' },
    '@/lib/document-display': { getDocumentDisplayInfo: document => ({ title: document.data.title }) },
    '@/services/workspace': {
      getWorkspaceDocument: (workspace, id) => new Promise((resolve, reject) => requests.push({ workspace, id, resolve, reject })),
      getWorkspaceDocumentByChecksum: (workspace, algo, checksum) => new Promise((resolve, reject) => requests.push({ workspace, algo, checksum, resolve, reject })),
    },
  }
  const exports = {}
  vm.runInNewContext(compile('../src/pages/workspaces/[workspaceName]/document.tsx'), { exports, Error, require: name => dependencies[name] })
  const render = (next = params) => {
    params = next; cursor = 0; effects = []
    const wrapper = exports.default()
    assert.equal(wrapper.type, 'gate', 'direct URLs retain workspace lifecycle protection')
    const view = wrapper.props.children.type()
    effects.forEach(fn => fn())
    return view
  }
  const elements = value => Array.isArray(value) ? value.flatMap(elements)
    : value && typeof value === 'object' ? [value, ...elements(value.props?.children)] : []
  return { render, requests, find: predicate => elements(render()).find(predicate), flush: () => new Promise(setImmediate) }
}

test('direct lookup inspects documents, refreshes saved edits, and reports missing IDs', async () => {
  const ui = setup()
  ui.render()
  assert.equal(ui.requests[0].workspace, 'preprod')
  assert.equal(ui.requests[0].id, 101140)
  ui.requests.shift().resolve({ id: 101140, schema: 'data/schema/note', data: { title: 'Inspect me' } })
  await ui.flush()
  assert.equal(ui.find(el => el.type === 'card').props.document.id, 101140)
  ui.find(el => el.type === 'card').props.onChanged()
  ui.render()
  ui.requests.shift().resolve({ id: 101140, schema: 'data/schema/note', data: { title: 'Saved edit' } })
  await ui.flush()
  assert.equal(ui.find(el => el.type === 'card').props.document.data.title, 'Saved edit')
  ui.render({ workspaceName: 'preprod', documentId: '101141' })
  assert.equal(ui.find(el => el.type === 'card'), undefined)
  ui.requests.shift().reject(Object.assign(new Error('Not found'), { statusCode: 404 }))
  await ui.flush()
  assert.match(JSON.stringify(ui.render()), /Document 101141 not found/)
})

test('checksum lookup opens the same document card and refreshes using the checksum', async () => {
  const ui = setup()
  const params = { workspaceName: 'preprod', algo: 'sha256', checksum: 'abc123' }
  ui.render(params)
  const lookup = ui.requests.shift()
  assert.equal(lookup.workspace, 'preprod')
  assert.equal(lookup.algo, 'sha256')
  assert.equal(lookup.checksum, 'abc123')
  assert.equal(lookup.id, undefined)
  lookup.resolve({ id: 101140, schema: 'data/schema/note', data: { title: 'By checksum' } })
  await ui.flush()
  assert.equal(ui.find(el => el.type === 'card').props.document.id, 101140)
  assert.match(JSON.stringify(ui.render()), /Checksum: sha256\/abc123/)
  ui.find(el => el.type === 'card').props.onChanged()
  ui.render()
  ui.requests.shift().reject(Object.assign(new Error('Not found'), { statusCode: 404 }))
  await ui.flush()
  assert.match(JSON.stringify(ui.render()), /Document sha256\/abc123 not found/)
})

test('lookup validates IDs and ignores responses from the previous workspace or ID', async () => {
  const ui = setup()
  ui.render()
  const old = ui.requests.shift()
  ui.render({ workspaceName: 'prod', documentId: '101140' })
  old.resolve({ id: 101140, data: { title: 'Old source' } })
  await ui.flush()
  assert.equal(ui.find(el => el.type === 'card'), undefined)
  ui.requests.shift().reject(new Error('Access denied'))
  await ui.flush()
  assert.match(JSON.stringify(ui.render()), /Access denied/)
  assert.doesNotMatch(JSON.stringify(ui.render()), /Document 101140 not found/)
  ui.render({ workspaceName: 'prod', documentId: '1.5' })
  assert.match(JSON.stringify(ui.render()), /positive integer/)
  assert.equal(ui.requests.length, 0)
})
