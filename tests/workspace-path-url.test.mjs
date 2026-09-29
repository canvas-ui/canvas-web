import test from 'node:test'
import assert from 'node:assert/strict'
import { workspacePathUrl } from '../src/lib/workspace-path-url.ts'

test('upload destination keeps its workspace, tree and nested path', () => {
  assert.equal(workspacePathUrl({ workspaceName: 'home', treeName: 'context', path: '/foo/bar/baz' }), '/workspaces/home/path/foo/bar/baz')
  assert.equal(workspacePathUrl({ workspaceName: 'home', treeName: 'directory', path: '/foo/bar/baz' }), '/workspaces/home/trees/directory/path/foo/bar/baz')
})
test('encodes URL delimiters in path segments and supports the root', () => {
  assert.equal(workspacePathUrl({ workspaceName: 'my workspace', treeName: 'context', path: '/photos/a #1?/100%' }), '/workspaces/my%20workspace/path/photos/a%20%231%3F/100%25')
  assert.equal(workspacePathUrl({ workspaceName: 'home', treeName: 'context', path: '/' }), '/workspaces/home/path/')
})
