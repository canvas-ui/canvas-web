import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { documentRulePresets } from '../src/lib/document-rule.ts'
import { attachmentDestinationPreview } from '../src/lib/attachment-destination.ts'

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
const names = new Set(['EVENT_OPTIONS', 'CONDITION_FIELDS', 'EXACT_FIELDS', 'conditionKey', 'TITLE_NAME', 'DATED_NAME', 'DOWNLOAD_KINDS', 'emptyAction', 'EMPTY_FORM', 'splitAlternatives', 'splitList', 'slugify', 'canKeepStorageSubfolders', 'exactContextSource', 'storagePathPreview', 'buildRule', 'parseRule', 'formFromPrefill'])
const statements = source.statements.filter(node => ts.isFunctionDeclaration(node) ? names.has(node.name.text) : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.has(d.name.getText(source))))
const context = {}
vm.runInNewContext(ts.transpileModule(statements.map(s => s.getText(source)).join('\n') + '\nglobalThis.builder = { buildRule, parseRule, formFromPrefill, storagePathPreview }', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
const { buildRule, parseRule, formFromPrefill, storagePathPreview } = context.builder
const plain = value => JSON.parse(JSON.stringify(value))
const pathBackend = { address: 'workspace:home', driver: 'custom', capabilities: { paths: true } }

test('PDF extraction and exact recipient survive edit/save/reopen', () => {
  const rule = { id: 'accounting', enabled: true, when: { event: 'document.inserted', schema: 'email', to: { equals: 'accounting@augmend.eu' } },
    then: [{ action: 'extractAttachments', to: 'workspace:home', mime: 'application/pdf', folder: 'Accounting', subfolder: '{{YYYY}}/{{MM}}', onConflict: 'rename' }] }
  const form = parseRule(rule)
  assert.equal(form.conditions[0].field, 'toExact')
  assert.deepEqual(plain(buildRule(form, [pathBackend])), rule)
  form.actions[0].attachmentName = 'invoice'
  form.actions[0].includeInline = true
  form.actions[0].attachmentMime = 'application/pdf, image/*'
  const saved = buildRule(form, [pathBackend])
  assert.deepEqual(plain(saved.then[0].mime), ['application/pdf', 'image/*'])
  assert.equal(saved.then[0].filename, 'invoice')
  assert.deepEqual(plain(buildRule(parseRule(saved), [pathBackend])), plain(saved))
  assert.throws(() => buildRule(form, []), /support for folder paths/)
  form.actions[0].attachmentMime = ''
  assert.throws(() => buildRule(form, [pathBackend]), /MIME types/)
  assert.equal(parseRule({ ...rule, then: [{ ...rule.then[0], unknown: true }] }), null, 'unknown settings stay JSON-only')
})

test('attachment destination preview shows the selected root, appended month and actual result', () => {
  const sample = new Date(2026, 9, 16, 12)
  assert.deepEqual(attachmentDestinationPreview('workspace:home', 'Accounting', '{{YYYY}}/{{MM}}', sample), {
    root: 'workspace:home/Accounting', added: '2026/10', result: 'workspace:home/Accounting/2026/10/<attachment filename>', date: '2026-10-16',
  })
  assert.equal(attachmentDestinationPreview('workspace:home', 'Archive', '', sample).result, 'workspace:home/Archive/<attachment filename>')
  assert.equal(attachmentDestinationPreview('workspace:home', '', '{{YYYY}}/{{MM}}', sample).result, 'workspace:home/2026/10/<attachment filename>')
})

test('store wizard defaults to copy and cannot save a move without its source', () => {
  const form = formFromPrefill({ kind: 'store', path: 'ctx:/Architecture', storeTo: 'workspace:home' })
  assert.equal(buildRule(form, [pathBackend]).then[0].mode, 'copy')
  form.actions[0].storeMode = 'move'
  assert.throws(() => buildRule(form), /Choose the source backend/)
  form.actions[0].storeFrom = 'workspace:data'
  const saved = buildRule(form, [pathBackend])
  assert.equal(saved.then[0].from, 'workspace:data')
  assert.deepEqual(plain(buildRule(parseRule(saved), [pathBackend])), plain(saved))
})

test('Context storage uses one explicit insertion destination and recreates its full path', () => {
  for (const path of ['context:/foo/bar/baz', 'ctx:/foo/bar/baz', '/foo/bar/baz']) {
    const form = formFromPrefill({ kind: 'store', path, storeTo: 'workspace:home', storeFolder: 'Archive' })
    const rule = buildRule(form, [pathBackend])
    assert.equal(rule.when.path, undefined)
    assert.match(rule.when.eventPathExact, /^(ctx|context):\/foo\/bar\/baz$/)
    assert.equal(rule.then[0].recursive, true)
    assert.equal(rule.then[0].pathMode, 'full')
    assert.deepEqual(plain(buildRule(parseRule(rule), [pathBackend])), plain(rule))
    const preview = storagePathPreview(form.actions[0], form.conditions, { ...pathBackend, treePath: '/workspace/home' })
    assert.equal(preview.root, 'backends:/workspace/home/Archive')
    assert.equal(preview.recreated, 'foo/bar/baz')
    assert.equal(preview.result, 'backends:/workspace/home/Archive/foo/bar/baz/<original filename>')
    form.actions[0].storeFolder = ''
    assert.equal(storagePathPreview(form.actions[0], form.conditions, pathBackend).result, 'workspace:home/foo/bar/baz/<original filename>')
    form.actions[0].recursive = false
    assert.equal(storagePathPreview(form.actions[0], form.conditions, pathBackend).result, 'workspace:home/<original filename>')
  }
})

test('Context path recreation refuses inferred membership, multiple folders and missing source paths', () => {
  for (const [field, value] of [['path', 'ctx:/foo'], ['pathExact', 'ctx:/foo'], ['eventPathExact', 'ctx:/foo | ctx:/bar']]) {
    const form = formFromPrefill({ kind: 'store', path: 'ctx:/foo', storeTo: 'workspace:home' })
    form.conditions = [{ field, value }]
    assert.throws(() => buildRule(form, [pathBackend]), /source path/)
  }
})

test('copy and move recreate paths on any backend that advertises support', () => {
  for (const mode of ['copy', 'move']) {
    const form = formFromPrefill({ kind: 'store', path: 'dir:/Projects', storeTo: 'workspace:home', storeFolder: 'Archive' })
    form.actions[0].storeMode = mode
    form.actions[0].storeFrom = 'source'
    const rule = buildRule(form, [pathBackend])
    assert.equal(rule.then[0].recursive, true)
    assert.equal(rule.then[0].mode, mode)
    assert.equal(rule.then[0].folder, 'Archive')
    assert.equal(rule.then[0].from, 'source')
    assert.deepEqual(plain(buildRule(parseRule(rule), [pathBackend])), plain(rule))
  }
})

test('unsupported, unknown or unloaded capabilities cannot silently flatten a recursive rule', () => {
  for (const backends of [[], [{ ...pathBackend, capabilities: { paths: false } }], [{ ...pathBackend, driver: 'file', capabilities: {} }]]) {
    const form = formFromPrefill({ kind: 'store', path: 'dir:/Projects', storeTo: 'workspace:home' })
    assert.throws(() => buildRule(form, backends), /support for folder paths/)
    form.actions[0].recursive = false
    assert.equal(buildRule(form, backends).then[0].recursive, undefined)
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
