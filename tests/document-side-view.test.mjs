import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { documentSideHash, readDocumentSideLocation } from '../src/lib/document-side-location.ts'

// Exercise the provider's navigation and asynchronous loads, including late
// responses after Back or a workspace switch, without a browser dependency.
function setup() {
  const slots = [], requests = [], navigations = []
  let cursor = 0, effects = [], route = { pathname: '/contexts/design', search: '?q=sketch', hash: '', state: null }
  const changed = (slot, deps) => !slot || deps.some((value, i) => value !== slot.deps[i])
  const react = {
    useState(initial) {
      const index = cursor++; slots[index] ??= { value: initial }
      return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next }]
    },
    useMemo(fn, deps) {
      const index = cursor++
      if (changed(slots[index], deps)) slots[index] = { value: fn(), deps }
      return slots[index].value
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps) },
    useEffect(fn, deps) {
      const index = cursor++
      if (changed(slots[index], deps)) effects.push(() => {
        slots[index]?.cleanup?.()
        slots[index] = { deps, cleanup: fn() }
      })
    },
  }
  const navigate = (to, options) => { navigations.push({ to, options }); route = { ...route, ...to, state: options.state } }
  const dependencies = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'react-router-dom': { useLocation: () => route, useNavigate: () => navigate },
    '@/services/workspace': { getWorkspaceDocument: (workspace, id) => new Promise((resolve, reject) => requests.push({ workspace, id, resolve, reject })) },
    '@/lib/document-side-location': { documentSideHash, readDocumentSideLocation },
    './use-side-view': { SideViewContext: { Provider: 'provider' } },
  }
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL('../src/components/shell/side-view-context.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(code, { exports, require: name => dependencies[name] })
  const render = (hash = route.hash) => {
    route = { ...route, hash }; cursor = 0; effects = []
    const value = exports.SideViewProvider({ children: null }).props.value
    effects.forEach(fn => fn())
    return value
  }
  return { render, requests, navigations, flush: async () => { await Promise.resolve(); await Promise.resolve(); return render() } }
}

test('opening, switching sections and closing preserve the main canvas and search', () => {
  const ui = setup()
  ui.render().open({ id: 42 }, 'shared-workspace')
  let view = ui.render()
  assert.equal(view.entry.document.id, 42)
  assert.equal(ui.requests.length, 0, 'the opening list already supplied the document')
  assert.ok(!ui.navigations[0].options.replace, 'opening creates a Back destination')
  view.update({ section: 'metadata', maximized: true })
  view = ui.render()
  assert.equal(view.location.section, 'metadata')
  assert.equal(view.location.maximized, true)
  assert.equal(ui.navigations.at(-1).options.replace, true)
  view.close()
  assert.equal(ui.render().entry, null)
  assert.equal(ui.navigations.at(-1).to.hash, '')
  for (const { to } of ui.navigations) {
    assert.equal(to.pathname, '/contexts/design')
    assert.equal(to.search, '?q=sketch')
  }
})

test('copied links fetch the requested workspace and ignore a previous workspace response', async () => {
  const ui = setup()
  assert.equal(ui.render('#document=42&workspace=old').loading, true)
  assert.equal(ui.render('#document=42&workspace=new&section=json&fullscreen=1').loading, true)
  assert.equal(ui.requests[1].workspace, 'new')
  ui.requests[0].resolve({ id: 42, data: { title: 'Wrong workspace' } })
  assert.equal((await ui.flush()).entry, null)
  ui.requests[1].resolve({ id: 42, data: { title: 'Correct workspace' } })
  const view = await ui.flush()
  assert.equal(view.entry.document.data.title, 'Correct workspace')
  assert.equal(view.entry.workspaceId, 'new')
  assert.equal(view.location.section, 'json')
  assert.equal(view.location.maximized, true)
})

test('Back during loading keeps the pane closed when the request eventually finishes', async () => {
  const ui = setup()
  ui.render('#document=42&workspace=home')
  ui.render('')
  ui.requests[0].resolve({ id: 42 })
  const view = await ui.flush()
  assert.equal(view.entry, null)
  assert.equal(view.location, null)
  assert.equal(view.loading, false)
})

test('failed deep links can be retried without losing the requested section', async () => {
  const ui = setup()
  ui.render('#document=42&workspace=home&section=metadata')
  ui.requests[0].reject({ statusCode: 404 })
  let view = await ui.flush()
  assert.equal(view.error, 'Document not found.')
  view.retry()
  assert.equal(ui.render().loading, true)
  ui.requests[1].resolve({ id: 42 })
  view = await ui.flush()
  assert.equal(view.entry.document.id, 42)
  assert.equal(view.location.section, 'metadata')
  assert.equal(view.error, undefined)
})
