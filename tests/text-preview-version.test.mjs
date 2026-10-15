import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const { outputText } = ts.transpileModule(readFileSync(new URL('../src/components/renderers/text.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
})
for (const name of ['PlaintextRenderer', 'MarkdownRenderer']) {
  test(`${name} changes its content cache identity after a file edit`, () => {
    const requests = [], exports = {}
    const dependencies = {
      'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
      '@/components/common/markdown-view': {},
      './types': { NOTE_SCHEMA: 'data/schema/note' },
      './useDocumentBlobUrl': { useDocumentBlobUrl: (workspace, id, options) => { requests.push({ workspace, id, ...options }); return { text: 'content', loading: false } } },
    }
    vm.runInNewContext(outputText, { exports, require: name => dependencies[name] })
    const render = checksum => exports[name]({ workspaceId: 'studio', document: { id: 42, schema: 'data/schema/file', checksumArray: [checksum] } })
    render('sha256/before'); render('sha256/after')
    assert.deepEqual(requests.map(r => r.version), ['sha256/before', 'sha256/after'])
    assert.ok(requests.every(r => r.workspace === 'studio' && r.id === 42 && r.mode === 'text'))
  })
}
