import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { documentRulePresets } from '../src/lib/document-rule.ts'

const doc = (schema, data, metadata = {}) => ({ id: 12, schema: `data/schema/${schema}`, data, metadata })
const email = doc('message/email', { from: { name: 'Accounts', address: 'accounts+uk@example.com' }, subject: 'Invoice (Q4) [123].', body: 'Total: $42.00\nDue soon' })
const slack = doc('message', { platform: 'slack', sender: { id: 'U123', name: 'Alex' }, text: 'Release v1.2?', channel: { id: 'C1' } }, { remoteId: '123.456' })
const whatsapp = doc('message', { platform: 'whatsapp', sender: { id: '123@s.whatsapp.net', name: 'Alex' }, text: 'Meet at 10?', channel: { id: 'group@g.us' } })

test('document presets use exact stable senders and escape literal regex seeds', () => {
  const presets = documentRulePresets(email)
  assert.deepEqual(presets[0].rule.when.from, { equals: 'accounts+uk@example.com' })
  for (const [id, field] of [['subject', 'subject'], ['body', 'body']]) {
    const pattern = presets.find(p => p.id === id).rule.when[field].regex
    assert.equal(new RegExp(pattern).test(email.data[field]), true)
    assert.equal(new RegExp(pattern).test('Unrelated invoice or body'), false)
  }
  assert.deepEqual(documentRulePresets(slack)[0].rule.when.sender, { equals: 'U123' })
})

test('thread roots and replies share a scoped rule, WhatsApp offers its stored conversation', () => {
  const thread = documentRulePresets(slack).find(p => p.id === 'thread').rule.when
  assert.deepEqual(thread.thread, { equals: '123.456' })
  assert.deepEqual(thread.channel, { equals: 'C1' })
  assert.deepEqual(thread.platform, { equals: 'slack' })
  const reply = { ...slack, data: { ...slack.data, threadId: '123.456' }, metadata: { remoteId: '123.999' } }
  assert.deepEqual(documentRulePresets(reply).find(p => p.id === 'thread').rule.when, thread)
  const wa = documentRulePresets(whatsapp)
  assert.equal(wa.some(p => p.id === 'thread'), false)
  assert.deepEqual(wa.find(p => p.id === 'channel').rule.when.channel, { equals: 'group@g.us' })
})

// Exercise the real builder serialization without mounting the settings page.
const source = ts.createSourceFile('rule-builder.tsx', readFileSync(new URL('../src/components/workspace/rule-builder.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const names = new Set(['EVENT_OPTIONS', 'CONDITION_FIELDS', 'EXACT_FIELDS', 'conditionKey', 'TITLE_NAME', 'DATED_NAME', 'DOWNLOAD_KINDS', 'emptyAction', 'EMPTY_FORM', 'splitAlternatives', 'splitList', 'slugify', 'canKeepStorageSubfolders', 'buildRule', 'parseRule', 'formFromPrefill'])
const statements = source.statements.filter(node => ts.isFunctionDeclaration(node) ? names.has(node.name.text) : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.has(d.name.getText(source))))
const context = {}
vm.runInNewContext(ts.transpileModule(statements.map(s => s.getText(source)).join('\n') + '\nglobalThis.builder = { buildRule, parseRule, formFromPrefill }', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
const { buildRule, parseRule, formFromPrefill } = context.builder
const plain = value => JSON.parse(JSON.stringify(value))

test('store wizard defaults to copy and cannot save a move without its source', () => {
  const form = formFromPrefill({ kind: 'store', path: 'ctx:/Architecture', storeTo: 'workspace:home' })
  assert.equal(buildRule(form).then[0].mode, 'copy')
  form.actions[0].storeMode = 'move'
  assert.throws(() => buildRule(form), /Choose the source backend/)
  form.actions[0].storeFrom = 'workspace:data'
  const saved = buildRule(form)
  assert.equal(saved.then[0].from, 'workspace:data')
  assert.deepEqual(plain(buildRule(parseRule(saved))), plain(saved))
})

test('storage wizard enables subfolders only for directory sources', () => {
  for (const path of ['context:/Architecture', 'ctx:/Architecture', '/Architecture', 'directory:/Files | context:/Architecture', '']) {
    const form = formFromPrefill({ kind: 'store', path, storeTo: 'workspace:home', storeFolder: '/foo/bar/baz/baf/' })
    assert.equal(form.actions[0].recursive, false, path)
    form.actions[0].recursive = true
    if (!path) form.conditions = []
    const action = buildRule(form).then[0]
    assert.equal(action.recursive, undefined, path)
    assert.equal(action.folder, 'foo/bar/baz/baf')
  }
  for (const path of ['dir:/Architecture', 'directory:/Architecture', 'backends:/workspace/home/Architecture']) {
    const form = formFromPrefill({ kind: 'store', path, storeTo: 'workspace:home', storeFolder: 'Architecture' })
    assert.equal(form.actions[0].recursive, true, path)
    assert.equal(buildRule(form).then[0].recursive, true, path)
  }
})

test('recursive linking from a backend into a context tree is preserved by the rule wizard', () => {
  const form = parseRule({ id: 'forward', enabled: true, when: { event: 'document.linked', path: 'backends:/workspace/home/Architecture' }, then: [{ action: 'link', paths: ['ctx:/Architecture'], recursive: true }] })
  assert.deepEqual(plain(buildRule(form).then), [{ action: 'link', paths: ['ctx:/Architecture'], recursive: true }])
})

test('email and chat presets survive edit/save/reopen with all conditions intact', () => {
  for (const document of [email, slack, whatsapp, doc('tab', { url: 'https://example.com/a?q=(b)' })]) {
    for (const preset of documentRulePresets(document)) {
      const form = formFromPrefill({ kind: 'document', rule: preset.rule })
      assert.equal(form.id, null)
      form.actions[0].a = '/Work'
      const saved = buildRule(form)
      assert.deepEqual(plain(saved.when), preset.rule.when, preset.id)
      const reopened = parseRule(saved)
      assert.ok(reopened, preset.id)
      assert.deepEqual(plain(buildRule(reopened)), plain(saved))
    }
  }
})

test('empty and invalid regex conditions cannot silently become match-all rules', () => {
  const form = formFromPrefill({ kind: 'document', rule: documentRulePresets(email).find(p => p.id === 'body').rule })
  form.actions[0].a = '/Work'
  form.conditions[0].value = ''
  assert.throws(() => buildRule(form), /Enter a value/)
  form.conditions[0].value = '['
  assert.throws(() => buildRule(form), /Invalid regular expression/)
  form.conditions[0].value = 'invoice|receipt'
  assert.deepEqual(plain(buildRule(form).when.body), { regex: 'invoice|receipt' })
})

test('exact identifiers containing pipes remain a single identifier', () => {
  const preset = documentRulePresets({ ...whatsapp, data: { ...whatsapp.data, channel: { id: 'one|two' } } }).find(p => p.id === 'channel')
  const form = formFromPrefill({ kind: 'document', rule: preset.rule })
  form.actions[0].a = '/Work'
  assert.deepEqual(plain(buildRule(form).when.channel), { equals: 'one|two' })
})

test('saving a document rule appends to the latest file and refuses failed or malformed reads', async () => {
  const file = ts.createSourceFile('hooks.ts', readFileSync(new URL('../src/services/hooks.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
  const append = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'appendHookRules')
  let content = JSON.stringify({ $schema: 'canvas.hook-rules/v1', custom: 'keep', rules: [{ id: 'added-by-another-editor' }] })
  let fail = false
  const writes = []
  const context = { exports: {}, RULES_PATH: 'rules.json', getHook: async () => { if (fail) throw new Error('Offline'); return content }, saveHook: async (_ws, _path, value) => writes.push(JSON.parse(value)) }
  vm.runInNewContext(ts.transpileModule(append.getText(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
  const rule = { ...documentRulePresets(email)[0].rule, id: 'new-rule' }
  await context.exports.appendHookRules('workspace', rule)
  assert.equal(writes[0].custom, 'keep')
  assert.deepEqual(writes[0].rules.map(r => r.id), ['added-by-another-editor', 'new-rule'])
  for (const invalid of ['{', '{}']) {
    content = invalid
    await assert.rejects(context.exports.appendHookRules('workspace', rule))
  }
  fail = true
  await assert.rejects(context.exports.appendHookRules('workspace', rule), /Offline/)
  assert.equal(writes.length, 1)
})
