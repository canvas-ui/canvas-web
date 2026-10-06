import test from 'node:test'
import assert from 'node:assert/strict'
import { whatsappMarkdown } from '../src/lib/whatsapp-markdown.ts'

test('formats WhatsApp bold, italic, strikethrough and code without losing links', () => {
  assert.equal(whatsappMarkdown('**bold** and *italic* and ~~strike~~ and `code`'), '*bold* and _italic_ and ~strike~ and `code`')
  assert.equal(whatsappMarkdown('[Canvas](https://example.com)'), 'Canvas (https://example.com)')
  assert.equal(whatsappMarkdown('First\n\nSecond'), 'First\n\nSecond')
  assert.equal(whatsappMarkdown('```js\nconst a = 1\n```'), '```\nconst a = 1\n```')
})
