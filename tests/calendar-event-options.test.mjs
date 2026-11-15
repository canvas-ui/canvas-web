import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as dates from '../src/lib/calendar/dates.ts'
import * as rules from '../src/lib/calendar/rrule.ts'
import { tagsToFeatures, featuresToTags } from '../src/components/toolbox/add/tags.ts'

const source = readFileSync(new URL('../src/components/toolbox/applets/calendar/EventPanel.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source + '\nexport { EventEditor };', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText
const jsx = (type, props) => ({ type, props })
function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}
function editor(doc = null) {
  const cells = []
  let cursor = 0
  const calls = { creates: [], updates: [], relations: [], links: [], saved: [], escape: [] }
  let failLinks = false
  let persisted = doc
  const relation = { rows: [], workspaceName: 'home', remove: index => relation.rows.splice(index, 1) }
  const dependencies = {
    react: {
      useState(initial) {
        const i = cursor++
        if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial
        return [cells[i], value => { cells[i] = typeof value === 'function' ? value(cells[i]) : value }]
      },
      useRef(initial) { const i = cursor++; return cells[i] ??= { current: initial } },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/calendar/dates': dates, '@/lib/calendar/rrule': rules,
    '@/lib/utils': { cn: (...x) => x.filter(Boolean).join(' ') },
    '@/components/renderers/types': { EVENT_SCHEMA: 'data/schema/event' },
    '@/hooks/useEscapeClose': { useEscapeClose: (...args) => calls.escape.push(args) },
    '@/lib/relation-events': { announceRelationsChanged() {} },
    '@/services/workspace': {
      getWorkspaceDocument: async () => persisted,
      updateWorkspaceDocument: async (workspace, payload) => { calls.updates.push({ workspace, payload }); persisted = payload },
      createDocumentRelations: async (...args) => { calls.relations.push(args); persisted.data.relations = [{ p: args[2], to: args[3][0] }] },
      pasteDocumentsToWorkspacePath: async (...args) => {
        calls.links.push(args)
        if (failLinks) throw new Error('Folder unavailable')
      },
    },
    '../../add/useAddTarget': {
      submitDocuments: async (target, documents) => { calls.creates.push({ target, documents }); persisted = { ...documents[0], id: 123 }; return [123] },
      resolveUploadWorkspace: async () => ({ workspaceName: 'home' }),
    },
    '../../add/useTodoFields': { isoToLocalInput: value => value, localInputToISO: value => value },
    '../../add/tags': { tagsToFeatures, featuresToTags },
    '../../add/useTagSuggestions': { useTagSuggestions: () => ['project'] },
    '../../add/useRelationFields': { useRelationFields: () => relation },
    '../../add/TagInput': { TagInput: 'tags' },
    '../../add/RelationFields': { RelationFields: 'relations' },
    '@/components/common/DocumentGeoField': { DocumentGeoField: 'geo' },
    '@/components/object-card/RelationsSection': { DocumentRelationsSection: 'existing-relations' },
    '@/components/menu/shared/LinkToCard': { LinkToCard: 'picker' },
    '@/components/menu/shared/LinkToSidePanel': { LinkToSidePanel: 'side-panel', LINK_TO_SIDE_SIZE: '' },
    './calendar-colors': { calendarColor: () => '' },
  }
  const exports = {}
  vm.runInNewContext(compiled, { exports, Error, require: name => dependencies[name] ?? {} })
  const target = { mode: 'workspace', workspaceName: 'home', path: '/', treeName: 'context', treeType: 'context' }
  const props = {
    subject: doc ? { kind: 'occurrence', occurrence: { key: 'event', kind: 'event', doc } }
      : { kind: 'draft', draft: { start: new Date('2026-11-15T00:00:00Z'), allDay: true } },
    workspaceName: 'home', target, calendars: ['Work'], defaultCalendar: 'Work',
    onSaved: calendar => calls.saved.push(calendar), onClose() {}, onDelete() {},
  }
  const render = () => { cursor = 0; return nodes(exports.EventEditor(props)) }
  const save = async () => {
    const button = render().find(n => n.type === 'button' && Array.isArray(n.props.children) && ['Create', 'Save'].includes(n.props.children.at(-1)))
    await button.props.onClick()
  }
  return { render, save, calls, relation, setFailLinks: value => { failLinks = value } }
}

test('new events stage tags, geotag, relations and tree links before creating', async () => {
  const e = editor()
  let view = e.render()
  view.find(n => n.type === 'input' && n.props.placeholder === 'Title').props.onChange({ target: { value: 'Project review' } })
  view.find(n => n.type === 'tags').props.onChange(['project'])
  view.find(n => n.type === 'geo').props.onChange({ lat: 48.1, lon: 17.1, source: 'manual' })
  e.relation.rows.push({ predicate: 'references', direction: 'out', targetId: 42 })
  view.find(n => n.props?.['aria-label'] === 'Link to…').props.onClick()
  view = e.render()
  const picker = view.find(n => n.type === 'picker')
  assert.equal(picker.props.fixedWorkspaceName, 'home')
  picker.props.onConfirm(['/Projects/Review'], { workspaceName: 'home', treeName: 'directory', treeType: 'directory' })
  assert.equal(e.calls.creates.length, 0)
  await e.save()
  const payload = e.calls.creates[0].documents[0]
  assert.equal(payload.data.title, 'Project review')
  assert.equal(payload.metadata.features[0], 'tag/project')
  assert.equal(payload.metadata.geo.lat, 48.1)
  assert.deepEqual(e.calls.relations[0].slice(0, 3), ['home', 123, 'references'])
  assert.deepEqual(e.calls.links[0].slice(0, 2), ['home', '/Projects/Review'])
  assert.equal(e.calls.links[0][2][0], 123)
  assert.equal(e.calls.saved.length, 1)
})

test('failed links retain the new event ID, retry only pending work and keep the dialog open', async () => {
  const e = editor()
  let view = e.render()
  view.find(n => n.type === 'input' && n.props.placeholder === 'Title').props.onChange({ target: { value: 'Review' } })
  e.relation.rows.push({ predicate: 'references', direction: 'out', targetId: 42 })
  view.find(n => n.props?.['aria-label'] === 'Link to…').props.onClick()
  e.render().find(n => n.type === 'picker').props.onConfirm(['/Project'], { workspaceName: 'home', treeName: 'context', treeType: 'context' })
  e.setFailLinks(true)
  await e.save()
  assert.equal(e.calls.saved.length, 0)
  assert.match(e.render().find(n => n.props?.role === 'alert').props.children, /Event created.*Folder unavailable/)
  e.setFailLinks(false)
  await e.save()
  assert.equal(e.calls.creates.length, 1)
  assert.equal(e.calls.updates[0].payload.id, 123)
  assert.equal(e.calls.updates[0].payload.data.relations[0].to, 42)
  assert.equal(e.calls.relations.length, 1)
  assert.equal(e.calls.saved.length, 1)
})

test('editing preserves source data and non-tag features and supports removing a geotag', async () => {
  const e = editor({ id: 77, schema: 'data/schema/event', schemaVersion: '3.0',
    features: ['tag/old', 'custom/keep'], metadata: { source: 'gcal', geo: { lat: 1, lon: 2 } },
    data: { title: 'Existing', allDay: true, start: '2026-11-15T00:00:00Z', uid: 'source-id' },
  })
  const view = e.render()
  assert.ok(view.some(n => n.type === 'existing-relations'))
  view.find(n => n.type === 'tags').props.onChange(['new'])
  view.find(n => n.type === 'geo').props.onChange(null)
  await e.save()
  const payload = e.calls.updates[0].payload
  assert.equal(payload.id, 77)
  assert.equal(payload.data.uid, 'source-id')
  assert.equal(payload.metadata.source, 'gcal')
  assert.equal(payload.metadata.features.join(','), 'custom/keep,tag/new')
  assert.equal(payload.metadata.geo, null)
  assert.equal(e.calls.creates.length, 0)
})
