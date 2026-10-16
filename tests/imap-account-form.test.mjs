import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.createSourceFile('imap-mailboxes-panel.tsx', readFileSync(new URL('../src/components/workspace/imap-mailboxes-panel.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const names = new Set(['EMPTY_FORM', 'formFromBackend', 'accountPatch'])
const statements = source.statements.filter(node => ts.isFunctionDeclaration(node) ? names.has(node.name.text) : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.has(d.name.getText(source))))
const context = {}
vm.runInNewContext(ts.transpileModule(statements.map(s => s.getText(source)).join('\n') + '\nglobalThis.form = { formFromBackend, accountPatch }', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
const { formFromBackend, accountPatch } = context.form

const backend = { address: 'accounting@example.com', config: { host: 'mail.example.com', user: 'accounting@example.com',
  passwordConfigured: true, initialSyncDays: 180, smtp: { enabled: true, host: 'smtp.example.com', passwordConfigured: true } } }

test('opening saved settings never populates credential fields', () => {
  const form = formFromBackend({ ...backend, config: { ...backend.config, password: 'redacted', smtp: { ...backend.config.smtp, password: 'redacted' } } })
  assert.equal(form.password, '')
  assert.equal(form.smtp.password, '')
  assert.equal(form.user, backend.address)
})

test('unrequested autofill cannot replace IMAP or SMTP credentials when saving another setting', () => {
  const form = formFromBackend(backend)
  form.password = 'unrelated-canvas-password'
  form.smtp.password = 'unrelated-canvas-password'
  form.initialSyncDays = 0
  const patch = accountPatch(form, true, false, false)
  assert.equal('password' in patch, false)
  assert.equal('password' in patch.smtp, false)
  assert.equal(patch.initialSyncDays, 0)
  assert.equal(patch.user, backend.address)
})

test('explicit password changes and new accounts send only the requested credentials', () => {
  const form = formFromBackend(backend)
  form.password = 'replacement-imap'
  form.smtp.password = 'replacement-smtp'
  assert.equal(accountPatch(form, true, true, false).password, 'replacement-imap')
  assert.equal('password' in accountPatch(form, true, true, false).smtp, false)
  assert.equal(accountPatch(form, true, false, true).smtp.password, 'replacement-smtp')
  assert.equal('password' in accountPatch(form, true, false, true), false)
  assert.equal(accountPatch(form, false, false, false).password, 'replacement-imap')
  form.password = ''; form.smtp.password = ''
  assert.equal('password' in accountPatch(form, true, true, true), false)
  assert.equal('password' in accountPatch(form, true, true, true).smtp, false)
})
