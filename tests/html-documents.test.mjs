import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyMime } from '../src/components/renderers/types.ts'

test('html files classify as pages, by type or by extension', () => {
  assert.equal(classifyMime('text/html', 'report.html'), 'html')
  assert.equal(classifyMime('text/html; charset=utf-8', null), 'html')
  assert.equal(classifyMime('application/xhtml+xml', null), 'html')
  assert.equal(classifyMime('', 'saved-page.htm'), 'html')
  assert.equal(classifyMime('application/octet-stream', 'Report.HTML'), 'html')
  assert.equal(classifyMime('text/plain; charset=utf-8', 'notes.txt'), 'text')
})
