import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function setup() {
  const slots = [], requests = []
  let cursor = 0, effects = [], share = null
  const react = {
    useState(initial) {
      const index = cursor++
      slots[index] ??= { value: initial }
      return [slots[index].value, value => { slots[index].value = value }]
    },
    useEffect(fn, deps) {
      const index = cursor++
      if (!slots[index] || deps.some((value, i) => value !== slots[index].deps[i])) {
        effects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: fn() } })
      }
    },
  }
  const fetchBlob = (id, options) => new Promise((resolve, reject) => requests.push({ id, options, resolve, reject }))
  const exports = {}
  const source = readFileSync(new URL('../src/components/renderers/use-email-body.ts', import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, AbortController, Error,
    require: name => name === 'react' ? react : {
      useDocumentContent: () => ({ fetchBlob }), usePublicShareCode: () => share,
    },
  })
  return {
    requests,
    render(document, workspace = 'universe', code = null) {
      share = code; cursor = 0; effects = []
      const result = exports.useEmailBody(workspace, document)
      effects.forEach(fn => fn())
      return result
    },
    async settle(index, body) {
      requests[index].resolve({ blob: new Blob([JSON.stringify(body)]) })
      await new Promise(resolve => setImmediate(resolve))
    },
    stop() { slots.forEach(slot => slot.cleanup?.()) },
  }
}
const email = id => ({ id, schema: 'data/schema/message/email', data: { subject: `Email ${id}`, bodyPreview: 'Preview only' }, checksumArray: [`sha256/${id}`] })

test('opening an indexed message fetches its body once and keeps it outside the document', async () => {
  const ui = setup(), doc = email(1)
  assert.equal(ui.render(doc).loading, true)
  assert.equal(ui.requests.length, 1)
  assert.equal(ui.requests[0].id, 1)
  assert.equal(ui.requests[0].options.format, 'email')
  assert.equal(ui.requests[0].options.version, 'sha256/1')
  ui.render({ ...doc, data: { ...doc.data } })
  assert.equal(ui.requests.length, 1, 'list refreshes must not redownload the body')
  await ui.settle(0, { body: 'Full message', bodyHtml: '<p>Full message</p>' })
  assert.equal(ui.render(doc).body, 'Full message')
  assert.equal(ui.render(doc).bodyHtml, '<p>Full message</p>')
  assert.equal(doc.data.body, undefined)
  ui.stop()
})

test('navigation cancels obsolete reads and never paints a body from another message or workspace', async () => {
  const ui = setup()
  ui.render(email(1))
  assert.equal(ui.render(email(2)).body, '')
  assert.equal(ui.requests[0].options.signal.aborted, true)
  await ui.settle(0, { body: 'Old result' })
  assert.equal(ui.render(email(2)).loading, true)
  await ui.settle(1, { body: 'Selected result' })
  assert.equal(ui.render(email(2)).body, 'Selected result')
  assert.equal(ui.render(email(2), 'other-workspace').body, '')
  assert.equal(ui.render(email(2), 'other-workspace', 'public-share').body, '')
  assert.equal(ui.requests[2].options.signal.aborted, true)
  ui.stop()
})

test('legacy inline messages need no body request; missing bodies produce a visible error', async () => {
  const ui = setup()
  assert.equal(ui.render({ ...email(1), data: { body: 'Legacy text' } }).body, 'Legacy text')
  assert.equal(ui.requests.length, 0)
  ui.render(email(2))
  ui.requests[0].reject(new Error('HTTP 404'))
  await new Promise(resolve => setImmediate(resolve))
  const result = ui.render(email(2))
  assert.equal(result.loading, false)
  assert.match(result.error, /404/)
  ui.stop()
})
