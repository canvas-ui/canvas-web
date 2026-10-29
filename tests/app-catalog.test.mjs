import test from 'node:test'
import assert from 'node:assert/strict'
import { groupApps, webAppUrl } from '../src/lib/app-catalog.ts'

const apps = [
  { id: 'native:writer', name: 'Writer', description: 'Documents', category: 'productivity', kind: 'desktop', target: 'writer.desktop' },
  { id: 'canvas:notes', name: 'Notes', description: 'Quick notes', category: 'productivity', kind: 'canvas', target: '/apps/notes' },
  { id: 'web:photos', name: 'Photocraft', description: 'Photo editor', category: 'creative', kind: 'web', target: 'https://example.com/photos' },
]
test('shared launcher groups Canvas, web and native entries by category', () => {
  const groups = groupApps(apps, '')
  assert.deepEqual(groups.map(group => group.id), ['productivity', 'creative'])
  assert.deepEqual(groups[0].apps.map(app => app.name), ['Notes', 'Writer'])
  assert.equal(groups[0].apps[1].target, 'writer.desktop')
  assert.deepEqual(groupApps(apps, '  PHOTO  ')[0].apps.map(app => app.id), ['web:photos'])
  assert.equal(groupApps(apps, 'productivity')[0].apps.length, 2)
  assert.equal(groupApps(apps, 'desktop')[0].apps[0].name, 'Writer')
  assert.equal(groupApps(apps, 'missing').length, 0)
})
test('web apps only launch HTTP(S) addresses without embedded credentials', () => {
  assert.equal(webAppUrl('https://example.com/photos?q=one#edit'), 'https://example.com/photos?q=one#edit')
  assert.equal(webAppUrl('http://localhost:8001'), 'http://localhost:8001/')
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/file', 'https://user:password@example.com', '//example.com']) {
    assert.throws(() => webAppUrl(url))
  }
})
