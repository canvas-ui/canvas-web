import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAutoLinkRule } from '../src/lib/auto-link.ts'

test('Auto-Link preserves literal folder names and supports context and directory destinations together', () => {
  const rule = buildAutoLinkRule('autolink-test', '/workspace/home/Work/Acme org/Accounting', [
    { tree: 'context', path: '/Work/Acme, org/Accounting' },
    { tree: 'directory', path: '/Accounts/Acme org' },
    { tree: 'context', path: '/Work/Acme, org/Accounting' },
  ], true)
  assert.equal(rule.when.path, 'backends:/workspace/home/Work/Acme org/Accounting')
  assert.deepEqual(rule.when.event, ['document.inserted', 'document.updated', 'document.linked'])
  assert.equal(rule.enabled, true)
  assert.equal(rule.cascade, true)
  assert.deepEqual(rule.then, [
    { action: 'link', paths: ['ctx:/Work/Acme, org/Accounting'], recursive: true },
    { action: 'link', paths: ['dir:/Accounts/Acme org'], recursive: true },
  ])
})

test('default Auto-Link matches only direct contents and does not modify storage', () => {
  const rule = buildAutoLinkRule('x', '/workspace/home/foo/bar', [{ tree: 'context', path: '/work/foo/bar' }])
  assert.equal(rule.when.path, undefined)
  assert.equal(rule.when.pathExact, 'backends:/workspace/home/foo/bar')
  assert.deepEqual(rule.then, [{ action: 'link', paths: ['ctx:/work/foo/bar'] }])
  assert.deepEqual(buildAutoLinkRule('x', '/s3/bucket/reports', [{ tree: 'directory', path: '/reports' }]).then,
    [{ action: 'link', paths: ['dir:/reports'] }])
  assert.throws(() => buildAutoLinkRule('x', '/workspace/home', []))
  assert.throws(() => buildAutoLinkRule('x', '/workspace/home', [{ tree: 'backends', path: '/' }]))
  assert.throws(() => buildAutoLinkRule('x', '/workspace/home', [{ tree: 'context', path: '/{{doc.id}}' }]))
})
