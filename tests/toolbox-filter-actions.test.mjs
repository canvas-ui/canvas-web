import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { DEFAULT_TOOLBOX_FILTERS } from '../src/types/workspace.ts'

const code = ts.transpileModule(readFileSync(new URL('../src/components/toolbox/panels/ToolsPanel.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText
function render(overrides = {}) {
  const exports = {}
  const value = { state: { activeContextType: 'context', filters: DEFAULT_TOOLBOX_FILTERS, toolsTab: 'features', isDirty: false, ...overrides }, hasActiveFilters: Boolean(overrides.active), clearFilters() {}, saveFilters() {} }
  vm.runInNewContext(code, { exports, URLSearchParams, require: name => ({
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-router-dom': { useLocation: () => ({ search: '' }) },
    '@/types/workspace': { DEFAULT_TOOLBOX_FILTERS },
    '@/components/toolbox/use-toolbox': { useToolbox: () => value },
    '@/lib/canvas-navigation': { readSearchQueries: () => [] },
    '@/lib/utils': { cn: (...args) => args.join(' ') },
  })[name] || {} })
  const nodes = []
  const walk = node => { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.forEach(walk); nodes.push(node); walk(node.props?.children) }
  walk(exports.ToolsPanel())
  return nodes.filter(node => node.type === 'button').map(node => node.props.children).flat().filter(item => typeof item === 'string').map(s => s.trim())
}

test('filter Save is absent until a nonempty view changes and disappears after Clear', () => {
  assert.ok(!render().includes('Save filters'))
  const edited = { ...DEFAULT_TOOLBOX_FILTERS, features: { allOf: ['data/schema/file'], anyOf: [], noneOf: [] } }
  assert.ok(render({ filters: edited, isDirty: true, active: true }).includes('Save filters'))
  assert.ok(!render({ isDirty: true }).includes('Save filters'), 'cleared defaults may differ from saved filters, but should not show Save')
  assert.ok(!render({ filters: edited, isDirty: false, active: true }).includes('Save filters'))
})

test('a changed sort remains saveable without treating the default sort as an active filter', () => {
  const filters = { ...DEFAULT_TOOLBOX_FILTERS, sort: { sortBy: 'title', order: 'desc' } }
  assert.ok(render({ filters, isDirty: true }).includes('Save filters'))
  assert.ok(!render({ isDirty: true }).includes('Clear'))
})
