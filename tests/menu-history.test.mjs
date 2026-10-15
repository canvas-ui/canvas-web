import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Exercise the real provider and URL synchronizer against a browser-history
// model. Menu-only entries share a URL, which a pathname-only test would miss.
function setup({ mobile = true, layout = 'standard', url = '/' } = {}) {
  const slots = [], entries = []
  let cursor = 0, effects = [], dirty = false, index = 0, serial = 0
  const route = (to, state = null) => {
    const parsed = typeof to === 'string' ? new URL(to, 'https://canvas.test') : to
    return { pathname: parsed.pathname, search: parsed.search || '', hash: parsed.hash || '', state, key: String(serial++) }
  }
  entries.push(route(url))
  const navigate = (to, options = {}) => {
    if (typeof to === 'number') index = Math.max(0, Math.min(entries.length - 1, index + to))
    else if (options.replace) entries[index] = route(to, options.state)
    else { entries.splice(index + 1); entries.push(route(to, options.state)); index++ }
    dirty = true
  }
  const changed = (slot, deps) => !slot || deps.some((value, i) => value !== slot.deps[i])
  const effect = (fn, deps) => {
    const i = cursor++
    if (changed(slots[i], deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() } })
  }
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    useReducer(reducer, initial) {
      const i = cursor++
      slots[i] ??= { value: initial, dispatch: action => {
        const next = reducer(slots[i].value, action)
        if (next !== slots[i].value) { slots[i].value = next; dirty = true }
      } }
      return [slots[i].value, slots[i].dispatch]
    },
    useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i] },
    useCallback(fn, deps) {
      const i = cursor++
      if (changed(slots[i], deps)) slots[i] = { value: fn, deps }
      return slots[i].value
    },
    useEffect: effect, useLayoutEffect: effect,
  }
  const dependencies = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'react-router-dom': { useLocation: () => entries[index], useNavigate: () => navigate },
    '@/hooks/use-mobile': { MOBILE_BREAKPOINT: 768 },
    '@/lib/settings-catalog': { PERSONAL_SETTINGS_PATHS: ['/settings'] },
    '@/lib/layout-mode': { loadLayoutMode: () => layout },
    '@/services/auth': { getCurrentUserFromToken: () => ({ id: 'test', email: 'test@canvas.test', userType: 'user' }) },
  }
  const window = { matchMedia: () => ({ matches: mobile }), history: { get state() { return { idx: index } } } }
  const load = filename => {
    const exports = {}
    const code = ts.transpileModule(readFileSync(new URL(`../src/components/shell/${filename}`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText
    vm.runInNewContext(code, { exports, window, require: name => { assert.ok(dependencies[name], name); return dependencies[name] } })
    return exports
  }
  dependencies['./use-menu'] = load('use-menu.ts')
  const { MenuProvider } = load('menu-context.tsx')
  const render = () => {
    let value
    for (let pass = 0; pass < 20; pass++) {
      cursor = 0; effects = []; dirty = false
      value = MenuProvider({ children: null }).props.value
      effects.forEach(fn => fn())
      if (!dirty) return value
    }
    throw new Error('Menu state did not settle')
  }
  return { render, navigate, get location() { return entries[index] }, get index() { return index } }
}

test('mobile Back and Forward retrace M0, list, workspace tree, and content', () => {
  const ui = setup()
  ui.render().toggleM0()
  ui.render().toggleSection('workspaces')
  ui.render().openM2('detail', 'studio')
  ui.render().navigateFromMenu('/workspaces/studio/trees/directory/path/Projects/Mobile?q=sketch')
  assert.equal(ui.render().state.m1Open, false)
  ui.render().goBack()
  assert.equal(ui.render().state.m2Open, true)
  assert.equal(ui.render().state.selectedEntityId, 'studio')
  assert.equal(ui.location.pathname, '/workspaces/studio/trees/directory/path/Projects/Mobile')
  assert.equal(ui.location.search, '?q=sketch')
  ui.render().closeM2()
  assert.equal(ui.render().state.m1Open, true)
  assert.equal(ui.render().state.m2Open, false)
  ui.render().goBack()
  assert.equal(ui.render().state.m0Open, true)
  assert.equal(ui.render().state.m1Open, false)
  ui.navigate(1); ui.render(); ui.navigate(1)
  assert.equal(ui.render().state.m2Open, true)
  ui.navigate(1)
  assert.equal(ui.render().state.m1Open, false)
})

test('Back from a content jump restores the visited path, not its parent folder', () => {
  const ui = setup({ url: '/workspaces/studio/trees/directory/path/Unrelated' })
  ui.render()
  ui.navigate('/workspaces/studio/trees/directory/path/Projects/Mobile')
  ui.render().goBack()
  assert.equal(ui.location.pathname, '/workspaces/studio/trees/directory/path/Unrelated')
})

test('a fresh deep link falls back through its tree and list to M0', () => {
  const ui = setup({ url: '/workspaces/studio/trees/directory/path/Projects/Mobile#document=42&workspace=studio' })
  ui.render().goBack()
  assert.equal(ui.render().state.m2Open, true)
  ui.render().closeM2()
  assert.equal(ui.render().state.m1Open, true)
  assert.equal(ui.render().state.m2Open, false)
  ui.render().goBack()
  assert.equal(ui.render().state.m0Open, true)
  assert.equal(ui.render().state.m1Open, false)
  assert.equal(ui.index, 0)
  assert.equal(ui.location.hash, '#document=42&workspace=studio')
})

test('nested workspace settings return to the tree that opened them', () => {
  const ui = setup()
  ui.render().toggleM0()
  ui.render().toggleSection('workspaces')
  ui.render().openM2('detail', 'studio')
  ui.render().openM2('settings', 'studio')
  ui.render().closeM2()
  assert.equal(ui.render().state.m2Open, true)
  assert.equal(ui.render().state.m2View, 'detail')
})

test('desktop and strip menus do not add browser history entries', () => {
  for (const options of [{ mobile: false }, { layout: 'strip' }]) {
    const ui = setup(options)
    ui.render().toggleSection('workspaces')
    ui.render().openM2('detail', 'studio')
    assert.equal(ui.index, 0)
    assert.equal(ui.render().state.m2Open, true)
    ui.render().navigateFromMenu('/workspaces/studio')
    assert.equal(ui.index, 1)
  }
})
