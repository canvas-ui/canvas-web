import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.createSourceFile('StreamingChatMessage.tsx', readFileSync(new URL('../src/components/agent/StreamingChatMessage.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const component = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'StreamingChatMessageComponent')
const context = {
  React: { createElement: (type, props, ...children) => ({ type, props, children }) },
  useState: initial => [initial, () => {}], useEffect: () => {},
  AgentAssistantExtras: 'extras', MarkdownView: 'markdown', Wifi: 'wifi', WifiOff: 'offline', Radio: 'radio', Cpu: 'cpu',
}
vm.runInNewContext(ts.transpileModule(component.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, context)
function findMarkdown(node) {
  if (node?.type === 'markdown') return node
  return node?.children?.map(findMarkdown).find(Boolean)
}
test('each streaming update displays all received text immediately, without restarting a typing animation', () => {
  for (const content of ['Hello', 'Hello world', 'Hello world!']) {
    const tree = context.StreamingChatMessageComponent({ message: { role: 'assistant', content, timestamp: '2026-11-01T00:00:00Z', isComplete: false }, isStreaming: true })
    assert.equal(findMarkdown(tree).props.content, content)
  }
  const tree = context.StreamingChatMessageComponent({ message: { role: 'assistant', content: 'Hello world!', isComplete: true }, isStreaming: false })
  assert.equal(findMarkdown(tree).props.content, 'Hello world!')
})
