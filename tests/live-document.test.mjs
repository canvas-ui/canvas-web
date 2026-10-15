import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const code = ts.transpileModule(readFileSync(new URL('../src/hooks/useLiveDocument.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
function harness() {
  const slots = [], reads = [], exports = {}
  let cursor, effects, rendering, rerender
  const react = {
    useState(initial) {
      const at = cursor++
      if (!(at in slots)) slots[at] = initial
      return [slots[at], value => { slots[at] = value; if (rendering) rerender = true }]
    },
    useRef(initial) { const at = cursor++; return slots[at] ??= { current: initial } },
    useCallback: fn => fn,
    useEffect(fn, deps) {
      const at = cursor++
      if (!slots[at] || deps.some((dep, i) => dep !== slots[at].deps[i])) effects.push(() => {
        slots[at]?.cleanup?.(); slots[at] = { deps, cleanup: fn() }
      })
    },
  }
  vm.runInNewContext(code, { exports, require: name => name === 'react' ? react : {
    getWorkspaceDocument: (workspace, id) => new Promise(resolve => reads.push({ workspace, id, resolve })),
  } })
  return { reads, render(workspace, doc) {
    let value
    do { cursor = 0; effects = []; rerender = false; rendering = true; value = exports.useLiveDocument(workspace, doc); rendering = false } while (rerender)
    effects.forEach(fn => fn())
    return value
  } }
}

test('a committed save takes precedence over an older pending preview refresh', async () => {
  const h = harness(), opened = { id: 42, version: 1 }, saved = { id: 42, version: 2 }
  let view = h.render('studio', opened)
  view.refresh()
  view.refresh(saved)
  assert.equal(h.render('studio', opened).document, saved)
  h.reads[0].resolve(opened)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.render('studio', opened).document, saved)
})

test('a successor save refreshes the returned ID instead of the opening snapshot', () => {
  const h = harness(), opened = { id: 42 }, saved = { id: 43 }
  h.render('studio', opened).refresh(saved)
  const view = h.render('studio', opened)
  assert.equal(view.document, saved)
  view.refresh()
  assert.equal(h.reads[0].id, 43)
})

test('identical IDs in different workspaces cannot share a refreshed document', async () => {
  const h = harness(), opened = { id: 42 }, other = { id: 42, comment: 'other workspace' }
  h.render('studio', opened).refresh()
  assert.equal(h.render('other', other).document, other)
  h.reads[0].resolve({ id: 42, comment: 'old request' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.render('other', other).document, other)
})
