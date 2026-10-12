import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { treeBreadcrumbs } from '../src/lib/tree-breadcrumbs.ts'
import { buildWorkspaceUrl, parseWorkspacePathFromUrl } from '../src/utils/url-params.ts'
import { backendTrashLocation, backendTrashPath } from '../src/lib/backend-trash.ts'

test('ancestors retain exact names and their tree through URL navigation', () => {
  const path = '/Náš Domček/a #1?/literal %2F/100%'
  const crumbs = treeBreadcrumbs(path, 'home')
  assert.deepEqual(crumbs, [
    { label: 'home', path: '/' },
    { label: 'Náš Domček', path: '/Náš Domček' },
    { label: 'a #1?', path: '/Náš Domček/a #1?' },
    { label: 'literal %2F', path: '/Náš Domček/a #1?/literal %2F' },
    { label: '100%', path },
  ])
  for (const treeName of ['context', 'directory', 'backends', 'Custom tree']) {
    for (const crumb of crumbs) {
      assert.deepEqual(parseWorkspacePathFromUrl(buildWorkspaceUrl('home', crumb.path, treeName)), { treeName, path: crumb.path })
    }
  }
  assert.deepEqual(treeBreadcrumbs('/', 'home'), [{ label: 'home', path: '/' }])
})

test('Trash ancestors preserve encoded backend addresses and permit leaving Trash', () => {
  const path = backendTrashPath('fs:/disk #1', 'Photos/Žehňa')
  const crumbs = treeBreadcrumbs(path, 'home')
  assert.equal(crumbs[0].path, '/')
  assert.equal(crumbs[1].path, '/Trash')
  assert.deepEqual(backendTrashLocation('backends', crumbs[2].path), { backend: 'fs:/disk #1', prefix: '' })
  assert.deepEqual(backendTrashLocation('backends', crumbs[3].path), { backend: 'fs:/disk #1', prefix: 'Photos' })
})

// Exercise the actual React event handlers without a browser or extra runtime
// dependencies. Hooks only manage scrolling; JSX remains a traversable tree.
const jsx = (type, props) => ({ type, props })
const dependencies = {
  react: { useEffect: () => {}, useRef: () => ({ current: null }) },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  '@/lib/utils': { cn: (...classes) => classes.filter(Boolean).join(' ') },
  '@/lib/tree-breadcrumbs': { treeBreadcrumbs },
  'lucide-react': {},
  '@/components/common/document-list': { DocumentList: 'documents' },
  '@/components/toolbox/use-toolbox': { useToolbox: () => ({}) },
}
function load(file) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  })
  const exports = {}
  vm.runInNewContext(outputText, { exports, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`)
    return dependencies[name]
  } })
  return exports
}
const { TreeBreadcrumbs } = load('components/common/tree-breadcrumbs.tsx')
dependencies['@/components/common/tree-breadcrumbs'] = { TreeBreadcrumbs }
const { DefaultCanvas } = load('components/canvas/DefaultCanvas.tsx')

function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (typeof node.type === 'function') return nodes(node.type(node.props))
  return [node, ...nodes(node.props?.children)]
}

test('breadcrumb controls navigate to ancestors and mark the current location', () => {
  const navigated = []
  const items = treeBreadcrumbs('/one/two', 'home')
  const rendered = nodes(TreeBreadcrumbs({ items, onNavigate: path => navigated.push(path) }))
  const buttons = rendered.filter(node => node.type === 'button')
  assert.deepEqual(buttons.map(node => node.props.children), ['home', 'one'])
  buttons.forEach(button => button.props.onClick())
  assert.deepEqual(navigated, ['/', '/one'])
  assert.equal(rendered.find(node => node.props?.['aria-current'] === 'location').props.children, 'two')
  assert.equal(nodes(TreeBreadcrumbs({ items })).filter(node => node.type === 'button').length, 0, 'read-only contexts have no fake navigation buttons')
  assert.ok(nodes(TreeBreadcrumbs({ items, onNavigate() {}, disabled: true })).filter(node => node.type === 'button').every(node => node.props.disabled))
})

test('folder, layer, and canvas headers expose navigation, including pane-local callbacks', () => {
  for (const urlType of ['directory', 'directory-layer', 'canvas']) {
    const navigated = []
    let browsed = false
    const rendered = nodes(DefaultCanvas({
      urlType, treeName: 'My tree', workspaceId: 'home', urlDisplay: 'home://one/two', contextPath: '/one/two',
      canvasInfo: { label: 'My canvas' }, documents: [], onNavigatePath: path => navigated.push(path),
      onBrowseTree: () => { browsed = true },
    }))
    assert.equal(rendered.filter(node => node.type === 'input').length, 0)
    const nav = rendered.find(node => node.type === 'nav' && node.props['aria-label'] === 'Tree path')
    nodes(nav).find(node => node.type === 'button' && node.props.children === 'one').props.onClick()
    assert.deepEqual(navigated, ['/one'])
    rendered.find(node => node.props?.['aria-label'] === 'Browse tree').props.onClick()
    assert.equal(browsed, true)
    assert.ok(rendered.some(node => node.type === 'span' && JSON.stringify(node.props.children).includes(urlType.endsWith('-layer') ? 'My tree:layer' : 'My tree')))
  }
})
