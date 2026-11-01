import { buildSystemPrompt } from '../src/lib/agent-persona.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

test('agent creation sends the entered API key and base URL at the API contract location', async () => {
  const source = ts.createSourceFile('index.tsx', readFileSync(new URL('../src/pages/agents/index.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let handler
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleCreateAgent') handler = node.initializer.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  let payload
  const noop = () => {}
  const context = {
    newAgentName: 'helper', newAgentLabel: '', newAgentDescription: '', newAgentColor: '#123456', newAgentProvider: 'anthropic',
    newAgentModel: 'claude-test', newAgentSystemPrompt: '',
    newAgentRole: ' Engineer ', newAgentIdentity: ' Carmack ', newAgentInstructions: ' Be precise. ', buildSystemPrompt,
    newAgentConnectorConfig: { apiKey: '  form-key  ', baseUrl: 'https://api.anthropic.com', maxTokens: 131072, temperature: 0, topP: 1 },
    createAgent: async data => { payload = data; return { id: '1', name: 'helper' } },
    setIsCreating: noop, setAgents: noop, setNewAgentName: noop, setNewAgentDescription: noop, setNewAgentColor: noop,
    setNewAgentRole: noop, setNewAgentIdentity: noop, setNewAgentInstructions: noop, setNewAgentLabel: noop, setNewAgentSystemPrompt: noop, setNewAgentConnectorConfig: noop, showToast: noop, setShowCreate: noop,
    generateNiceRandomHexColor: () => '#123456', defaultBaseUrls: { anthropic: 'https://api.anthropic.com' }, navigate: noop, console,
  }
  vm.runInNewContext(ts.transpileModule(`globalThis.submit = ${handler}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  await context.submit({ preventDefault: noop })
  assert.equal(payload.config.identity.role, 'Engineer')
  assert.equal(payload.config.identity.identity, 'Carmack')
  assert.equal(payload.config.identity.instructions, 'Be precise.')
  assert.equal(payload.config.prompts.system, '## Role\nEngineer\n\n## Identity\nCarmack\n\n## Instructions\nBe precise.')
  context.newAgentSystemPrompt = ' Explicit override '
  await context.submit({ preventDefault: noop })
  assert.equal(payload.config.prompts.system, 'Explicit override')
  assert.equal(payload.config.identity.role, 'Engineer')
  assert.equal(payload.apiKey, 'form-key')
  assert.equal(payload.baseUrl, 'https://api.anthropic.com')
  assert.equal(payload.config.connectors.anthropic.apiKey, undefined)
  assert.equal(payload.config.connectors.anthropic.maxTokens, 131072)
  assert.equal(payload.config.connectors.anthropic.temperature, 0)
})
