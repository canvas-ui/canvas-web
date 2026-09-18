import test from 'node:test'
import assert from 'node:assert/strict'
import { workspaceAddress } from '../src/lib/workspace-address.ts'

test('owned and shared workspaces with the same name have distinct navigation addresses', () => {
  const own = { id: 'own-id', name: 'default' }
  const shared = { id: 'shared-id', name: 'default', isShared: true }
  assert.equal(workspaceAddress(own), 'default')
  assert.equal(workspaceAddress(shared), 'shared-id')
  assert.equal(workspaceAddress({ ...shared, isShared: undefined, type: 'shared' }), 'shared-id')
})
