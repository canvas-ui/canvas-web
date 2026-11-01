import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.createSourceFile('agent.ts', readFileSync(new URL('../src/services/agent.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
const names = ['chatWithAgentStream', 'extractAgentMessageText', 'extractAgentMessageMetadata', 'extractAgentMessageReasoning']
const code = source.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(source).replace('export ', '')).join('\n')
async function run(events, withMessages = true) {
  const messages = [], errors = []
  const context = { API_URL: '/rest/v2', api: { stream: async (_url, _body, callbacks) => {
    const wire = events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
    for (let i = 0; i < wire.length; i += 7) callbacks.onChunk(wire.slice(i, i + 7))
  } } }
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  await context.chatWithAgentStream('agent', 'hi', { onError: error => errors.push(error.message), ...(withMessages ? { onMessage: (text, complete) => messages.push({ text, complete }) } : {}) })
  return { messages, errors }
}
const failure = { role: 'assistant', content: [], stopReason: 'error', errorMessage: 'temperature is deprecated for this model.' }
test('streamed provider errors show immediately and complete the transcript without duplicate alerts', async () => {
  const result = await run([{ type: 'error', error: failure.errorMessage }, { type: 'complete', messages: [failure] }])
  assert.deepEqual(result.errors, [failure.errorMessage])
  assert.deepEqual(result.messages, [{ text: failure.errorMessage, complete: true }])
})
test('errors reach callers without a message callback', async () => {
  assert.deepEqual((await run([{ type: 'error', error: 'failed' }], false)).errors, ['failed'])
})
test('completion displays provider error messages after partial text', async () => {
  const result = await run([{ type: 'chunk', delta: 'partial' }, { type: 'complete', messages: [failure] }])
  assert.deepEqual(result.errors, [failure.errorMessage])
  assert.equal(result.messages[1].text, '\n\n' + failure.errorMessage)
})
test('successful completion does not duplicate text deltas', async () => {
  const result = await run([{ type: 'chunk', delta: 'hello' }, { type: 'complete', messages: [{ role: 'assistant', content: [{ type: 'text', text: 'hello' }] }] }])
  assert.deepEqual(result.messages, [{ text: 'hello', complete: false }, { text: '', complete: true }])
  assert.deepEqual(result.errors, [])
})
