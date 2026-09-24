import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAutoLinkRule, buildAutoLinkRules } from '../src/lib/auto-link.ts'

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

const storage = { address: 'workspace:home', key: 'foo/bar' }
const targets = [{ tree: 'context', path: '/work/foo/bar' }, { tree: 'directory', path: '/files' }]
test('reverse defaults to copy, direct membership, and conflict refusal', () => {
  const [rule] = buildAutoLinkRules('a', '/workspace/home/foo/bar', targets, false, 'reverse', 'copy', storage)
  assert.equal(rule.id, 'a-reverse')
  assert.equal(rule.cascade, false)
  assert.deepEqual(rule.when, { event: ['document.inserted', 'document.linked'], pathExact: ['context:/work/foo/bar', 'directory:/files'] })
  assert.deepEqual(rule.then, [{ action: 'store', to: 'workspace:home', folder: 'foo/bar', mode: 'copy', autoLink: true, onConflict: 'error' }])
})
test('both creates independently controllable related rules with recursive storage', () => {
  const rules = buildAutoLinkRules('a', '/workspace/home/foo/bar', targets, true, 'both', 'move', storage)
  assert.deepEqual(rules.map(rule => rule.id), ['a', 'a-reverse'])
  assert.equal(rules[1].then[0].recursive, true)
  assert.equal(rules[1].then[0].mode, 'move')
  assert.deepEqual(rules[1].when.path, ['context:/work/foo/bar', 'directory:/files'])
  assert.throws(() => buildAutoLinkRules('a', '/workspace/home', targets, false, 'reverse'))
  assert.throws(() => buildAutoLinkRules('a', '/workspace/home/{{id}}', targets, false, 'reverse', 'copy', storage))
})
