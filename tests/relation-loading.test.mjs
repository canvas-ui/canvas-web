import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.createSourceFile('RelationsSection.tsx', readFileSync(new URL('../src/components/object-card/RelationsSection.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const callbacks = {}
function visit(node) {
  if (ts.isVariableDeclaration(node)) {
    const name = node.name.getText(source)
    if (name === 'load') callbacks.load = node.initializer.arguments[0].getText(source)
    if (name === 'openDocument') callbacks.openDocument = node.initializer.getText(source)
  }
  ts.forEachChild(node, visit)
}
visit(source)
function evaluate(name, context) {
  vm.runInNewContext(ts.transpileModule(`globalThis.run = ${callbacks[name]}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return context.run
}

test('relation pages request compact previews beyond the old 200-row cap and ignore stale responses', async () => {
  const requests = []
  const painted = []
  const context = {
    workspaceId: 'w', document: { id: 1 }, page: 4, PAGE_SIZE: 50,
    requestSeq: { current: 0 },
    getDocumentRelations: (_workspace, _id, options) => new Promise(resolve => requests.push({ options, resolve })),
    setRelations: value => painted.push(value), setError() {}, setPage() {}, setPageCount() {},
  }
  const load = evaluate('load', context)
  const old = load()
  context.page = 5
  const recent = load()
  assert.equal(requests[0].options.offset, 200)
  assert.equal(requests[0].options.summary, true)
  assert.equal(requests[1].options.offset, 250)
  const latest = { outgoing: [], incoming: [{ from: 252 }], incomingCount: 260 }
  requests[1].resolve(latest)
  await recent
  requests[0].resolve({ outgoing: [], incoming: [{ from: 202 }], incomingCount: 260 })
  await old
  assert.deepEqual(painted, [latest])
})

test('opening a relation preview fetches the full document before opening the viewer', async () => {
  const opened = []
  const loading = []
  let resolve
  const full = { id: 202, schema: 'data/schema/message/email', data: { bodyHtml: '<p>Full message</p>' } }
  const context = {
    otherId: 202, doc: { id: 202, data: { subject: 'Preview' } }, relation: { preview: true }, workspaceId: 'w', canvasRow: false,
    getWorkspaceDocument: (workspace, id) => { assert.equal(workspace, 'w'); assert.equal(id, 202); return new Promise(r => { resolve = r }) },
    open: doc => opened.push(doc), setOpening: value => loading.push(value), showErrorToast: assert.fail,
  }
  const task = evaluate('openDocument', context)()
  assert.equal(opened.length, 0)
  resolve(full)
  await task
  assert.deepEqual(opened, [full])
  assert.deepEqual(loading, [true, false])
})
