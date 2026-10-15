import test from 'node:test'
import assert from 'node:assert/strict'
import { CONTENT_APPS, contentViewSchema, viewsFromLayerMetadata } from '../src/components/common/content-views.ts'
import { onAccentSolidTextClass, relativeLuminance } from '../src/utils/color.ts'

test('every built-in content app survives metadata persistence alongside existing views', () => {
  const views = CONTENT_APPS.map(app => ({ id: app.id, name: app.label, kind: 'app', app: app.id }))
  assert.deepEqual(viewsFromLayerMetadata(JSON.parse(JSON.stringify({ views }))), views)
  assert.deepEqual(views.map(contentViewSchema), [undefined, undefined, 'data/schema/note', undefined, undefined])
  assert.deepEqual(CONTENT_APPS.map(app => app.label), ['Todo list', 'Todo App', 'Notes list', 'Notes App', 'Sketch'])
  assert.equal(contentViewSchema({ id: 'list', name: 'All', kind: 'documents' }), undefined)
  assert.equal(contentViewSchema(null), undefined)
  assert.equal(viewsFromLayerMetadata({ views: [{ id: 'unknown', name: 'Unknown', kind: 'app', app: 'unknown' }] })[0].kind, 'documents')
})

test('previously saved Filters and Lens tabs remain available', () => {
  const views = ['filters', 'lens'].map(app => ({ id: app, name: app, kind: 'app', app }))
  assert.deepEqual(viewsFromLayerMetadata({ views }), views)
})

test('workspace-coloured labels meet text contrast on dark, light, and saturated accents', () => {
  // Sample the RGB cube, including the mid tones where a 50% cutoff fails.
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
    const color = '#' + [r, g, b].map(channel => channel.toString(16).padStart(2, '0')).join('')
    const luminance = relativeLuminance(color)
    const contrast = onAccentSolidTextClass(color) === 'text-black' ? (luminance + 0.05) / 0.05 : 1.05 / (luminance + 0.05)
    assert.ok(contrast >= 4.5, `${color}: ${contrast}`)
  }
})
