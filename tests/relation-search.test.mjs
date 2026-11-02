import test from 'node:test'
import assert from 'node:assert/strict'
import { relationSearchCompletion } from '../src/lib/relation-search.ts'

test('predicate suggestions include the entire server registry without a local allowlist', () => {
  const registry = ['authored-by', 'addressed-to', 'future-registered-predicate']
  assert.deepEqual(relationSearchCompletion('@', registry), { before: '', predicates: registry })
  assert.deepEqual(relationSearchCompletion('  @add', registry), { before: '  ', predicates: ['addressed-to'] })
  assert.deepEqual(relationSearchCompletion('invoice !@auth', registry), { before: 'invoice !', predicates: ['authored-by'] })
  assert.deepEqual(relationSearchCompletion('@future-', registry).predicates, ['future-registered-predicate'])
  assert.deepEqual(relationSearchCompletion('@', []).predicates, [])
})

test('completion leaves values, email addresses and ordinary text alone', () => {
  for (const query of ['email@domain.tld', '@authored-by: email@domain.tld', '@authored-by: ', 'ordinary text', '@authored-by: "Jane Doe"']) {
    assert.equal(relationSearchCompletion(query, ['authored-by']), null, query)
  }
})
