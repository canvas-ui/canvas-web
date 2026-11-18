import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, ExternalLink, Link2, Loader2, Repeat, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DatePicker, DateTimePicker } from '@/components/ui/date-time-picker'
import { EVENT_SCHEMA } from '@/components/renderers/types'
import { createDocumentRelations, getWorkspaceDocument, pasteDocumentsToWorkspacePath, updateWorkspaceDocument } from '@/services/workspace'
import { useMirrorSaveState } from '@/lib/remote-mirror'
import { dateKey, dateFromKey, localInput, addDays } from '@/lib/calendar/dates'
import { describeRRule, parseRRule, presetRRule, recurrenceEnd, repeatPreset, type RepeatPreset } from '@/lib/calendar/rrule'
import type { Occurrence } from '@/lib/calendar/occurrences'
import type { Document, DocumentGeo } from '@/types/workspace'
import { resolveUploadWorkspace, submitDocuments, type AddTarget } from '../../add/useAddTarget'
import { isoToLocalInput, localInputToISO } from '../../add/useTodoFields'
import { GrowingTextarea, LinkDocOverlay } from '../shared'
import { calendarColor } from './calendar-colors'

import { DocumentGeoField } from '@/components/common/DocumentGeoField'
import { DocumentRelationsSection } from '@/components/object-card/RelationsSection'
import { TagInput } from '../../add/TagInput'
import { useTagSuggestions } from '../../add/useTagSuggestions'
import { featuresToTags, tagsToFeatures } from '../../add/tags'
import { useRelationFields } from '../../add/useRelationFields'
import { createOnDestination, useCreateDestinations, type CreateDestination } from '../../add/useCreateDestinations'
import { RelationFields } from '../../add/RelationFields'
import { LinkToCard, type LinkToTarget } from '@/components/menu/shared/LinkToCard'
import { LinkToSidePanel, LINK_TO_SIDE_SIZE } from '@/components/menu/shared/LinkToSidePanel'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { announceRelationsChanged } from '@/lib/relation-events'

const EVENT_SCHEMA_VERSION = '3.0'

/** A new event being composed: where it starts and whether it is all-day. */
export interface EventDraft {
  start: Date
  allDay: boolean
  /** Exclusive end from a drag selection; omitted = one hour / one day. */
  end?: Date
}

export type PanelSubject = { kind: 'draft'; draft: EventDraft } | { kind: 'occurrence'; occurrence: Occurrence }

const REPEAT_OPTIONS: Array<{ id: RepeatPreset; label: string }> = [
  { id: 'none', label: 'Does not repeat' },
  { id: 'daily', label: 'Every day' },
  { id: 'weekdays', label: 'Every weekday' },
  { id: 'weekly', label: 'Every week' },
  { id: 'monthly', label: 'Every month' },
  { id: 'yearly', label: 'Every year' },
  { id: 'custom', label: 'Custom (RRULE)…' },
]

interface Fields {
  title: string
  calendar: string
  allDay: boolean
  /** Local `YYYY-MM-DDTHH:mm` (timed) or `YYYY-MM-DD` (all-day). */
  start: string
  end: string
  location: string
  description: string
  repeat: RepeatPreset
  /** Last day of the series, `YYYY-MM-DD`, or '' for no end by date. */
  until: string
  /** Occurrence count as typed, or '' for no end by count. */
  count: string
  rrule: string
}

function fieldsFromDoc(doc: Document, defaultCalendar: string): Fields {
  const d = doc.data ?? {}
  const allDay = d.allDay === true
  const startIso = String(d.start ?? '')
  const endIso = typeof d.end === 'string' ? d.end : ''
  const recurrence = typeof d.recurrence === 'string' ? d.recurrence : ''
  const repeat = repeatPreset(recurrence || undefined)
  const end = recurrenceEnd(recurrence || undefined)
  return {
    title: String(d.title ?? ''),
    calendar: typeof d.calendar === 'string' ? d.calendar : (syncSource(doc) ? '' : defaultCalendar),
    allDay,
    // All-day dates are stored at midnight UTC; the end is exclusive.
    start: allDay ? startIso.slice(0, 10) : isoToLocalInput(startIso),
    end: allDay ? allDayEndInclusive(startIso.slice(0, 10), endIso) : isoToLocalInput(endIso),
    location: String(d.location ?? ''),
    description: String(d.description ?? ''),
    repeat,
    until: end.until,
    count: end.count === null ? '' : String(end.count),
    rrule: recurrence,
  }
}

function fieldsFromDraft(draft: EventDraft, defaultCalendar: string): Fields {
  const end = draft.end ?? new Date(draft.start.getTime() + 60 * 60_000)
  return {
    title: '', calendar: defaultCalendar, allDay: draft.allDay,
    start: draft.allDay ? dateKey(draft.start) : localInput(draft.start),
    // All-day ends are exclusive; the form shows the last day inclusively.
    end: draft.allDay ? dateKey(addDays(end, -1) < draft.start ? draft.start : addDays(end, -1)) : localInput(end),
    location: '', description: '', repeat: 'none', until: '', count: '', rrule: '',
  }
}

/** The recurrence a form state stores: the raw rule when custom, else preset + end. */
function recurrenceOf(f: Fields): string | undefined {
  if (f.repeat === 'custom') return f.rrule.trim()
  const count = Number(f.count)
  return presetRRule(f.repeat, { until: f.until, count: Number.isInteger(count) && count > 0 ? count : null })
}

/** Connector-synced documents carry their driver and backend in metadata. */
function syncSource(doc: Document): { source: string; connector: string } | null {
  const meta = doc.metadata as Record<string, unknown> | undefined
  return typeof meta?.source === 'string' && meta.source ? { source: meta.source, connector: typeof meta.connector === 'string' ? meta.connector : '' } : null
}

/** Stored all-day ends are exclusive midnights (DTEND); the form shows the last day. */
function allDayEndInclusive(startDay: string, endIso: string): string {
  if (!endIso) return ''
  const [y, m, d] = endIso.slice(0, 10).split('-').map(Number)
  const last = dateKey(new Date(y, m - 1, d - 1))
  return last < startDay ? startDay : last
}

/** Last all-day day shown inclusively in the form → exclusive ISO end for storage. */
function allDayEndExclusive(lastDay: string): string {
  return `${dateKey(addDays(dateFromKey(lastDay), 1))}T00:00:00.000Z`
}

function buildData(previous: Record<string, unknown>, f: Fields): Record<string, unknown> {
  const data: Record<string, unknown> = { ...previous, title: f.title.trim() }
  const set = (key: string, value: unknown) => { if (value === undefined || value === '' || value === false) delete data[key]; else data[key] = value }
  set('calendar', f.calendar.trim())
  set('allDay', f.allDay)
  set('location', f.location.trim())
  set('description', f.description.trim())
  set('recurrence', recurrenceOf(f))
  if (f.allDay) {
    data.start = `${f.start}T00:00:00.000Z`
    set('end', f.end ? allDayEndExclusive(f.end) : undefined)
  } else {
    data.start = localInputToISO(f.start)
    set('end', localInputToISO(f.end))
  }
  return data
}

function validate(f: Fields): string | null {
  if (!f.title.trim()) return 'Give the event a title.'
  if (!f.start) return 'Pick a start.'
  if (f.end && f.end < f.start) return 'The end is before the start.'
  if (f.calendar.includes(':')) return 'A calendar name cannot contain ":".'
  if (f.repeat === 'custom' && (!f.rrule.trim() || !parseRRule(f.rrule))) return 'Enter a supported RRULE (FREQ=…, INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYMONTH).'
  if (f.repeat !== 'none' && f.repeat !== 'custom' && f.until && f.until < f.start.slice(0, 10)) return 'The series ends before it starts.'
  if (f.repeat !== 'none' && f.repeat !== 'custom' && f.count && !(Number.isInteger(Number(f.count)) && Number(f.count) > 0)) return 'The number of occurrences must be a whole number above zero.'
  return null
}

interface EventPanelProps {
  subject: PanelSubject
  target: AddTarget
  workspaceName: string | null
  calendars: string[]
  defaultCalendar: string
  onClose: () => void
  onSaved: (calendar: string) => void
  onDelete: (doc: Document) => Promise<void>
}

export function EventPanel(props: EventPanelProps) {
  const { subject } = props
  const key = subject.kind === 'draft'
    ? `draft:${subject.draft.start.getTime()}:${subject.draft.end?.getTime() ?? ''}:${subject.draft.allDay}`
    : subject.occurrence.key
  return <EventEditor key={JSON.stringify([props.workspaceName, props.target, key])} {...props} />
}

function EventEditor({ subject, target, workspaceName, calendars, defaultCalendar, onClose, onSaved, onDelete }: EventPanelProps) {
  const doc = subject.kind === 'occurrence' ? (subject.occurrence.doc as Document) : null
  const isTask = subject.kind === 'occurrence' && subject.occurrence.kind === 'task'
  const [fields, setFields] = useState<Fields>(() => doc ? fieldsFromDoc(doc, defaultCalendar) : fieldsFromDraft((subject as { draft: EventDraft }).draft, defaultCalendar))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)
  const savedId = useRef<number | null>(doc?.id ?? null)
  const [created, setCreated] = useState(false)
  const storedFeatures = doc?.features ?? []
  const [tags, setTags] = useState(() => featuresToTags(storedFeatures))
  const [geo, setGeo] = useState<DocumentGeo | null>(() => (doc?.metadata?.geo as DocumentGeo | undefined) ?? null)
  const relations = useRelationFields(target, workspaceName ? { workspaceName, documents: [] } : null)
  const resolvedWorkspace = workspaceName ?? relations.workspaceName
  const suggestions = useTagSuggestions(resolvedWorkspace)
  const [paths, setPaths] = useState<Array<LinkToTarget & { path: string }>>([])
  useEscapeClose(onClose, !saving)

  // Connected calendars with write-back. A new event filed under the Canvas
  // name of one of them is created there, and its mirror comes back synced.
  const destinations = useCreateDestinations(doc ? null : resolvedWorkspace, 'event')
  const remote = !doc && !created ? destinations.find(d => d.calendar?.toLowerCase() === fields.calendar.trim().toLowerCase()) : undefined
  const pickerCalendars = [...calendars, ...destinations.map(d => d.calendar).filter((name): name is string => !!name && !calendars.some(c => c.toLowerCase() === name.toLowerCase()))]

  const patch = (p: Partial<Fields>) => setFields(f => ({ ...f, ...p }))
  const synced = doc ? syncSource(doc) : null
  const link = typeof doc?.data?.htmlLink === 'string' ? doc.data.htmlLink : null

  const save = async () => {
    const problem = validate(fields)
    if (problem) { setError(problem); return }
    setSaving(true)
    setError(null)
    try {
      const workspace = resolvedWorkspace ?? (await resolveUploadWorkspace(target)).workspaceName
      // Relation controls write through to data.relations. Re-read before
      // replacing data so saving event fields retains those edges.
      const latest = savedId.current !== null ? await getWorkspaceDocument(workspace, savedId.current) : null
      const metadata = {
        ...latest?.metadata,
        features: [...(latest?.features ?? storedFeatures).filter(feature => !feature.startsWith('tag/')), ...tagsToFeatures(tags)],
        ...(geo || latest?.metadata?.geo ? { geo } : {}),
      }
      if (savedId.current !== null) {
        await updateWorkspaceDocument(workspace, {
          id: savedId.current, schema: doc?.schema ?? EVENT_SCHEMA, schemaVersion: doc?.schemaVersion || EVENT_SCHEMA_VERSION,
          data: buildData(latest?.data ?? {}, fields), metadata,
        })
      } else if (remote) {
        savedId.current = await createOnDestination(workspace, remote, 'event', buildData({}, fields), { features: metadata.features, target })
        setCreated(true)
      } else {
        const ids = await submitDocuments(target, [{ schema: EVENT_SCHEMA, schemaVersion: EVENT_SCHEMA_VERSION, data: buildData({}, fields), metadata }])
        if (!ids.length) throw new Error('The event was not created. Try again.')
        savedId.current = ids[0]
        setCreated(true)
      }
      // Remove each completed operation so a retry only writes pending links.
      for (let i = relations.rows.length - 1; i >= 0; i--) {
        const row = relations.rows[i]
        await createDocumentRelations(workspace, savedId.current, row.predicate, [row.targetId], row.direction)
        relations.remove(i)
        announceRelationsChanged()
      }
      for (const destination of paths) {
        await pasteDocumentsToWorkspacePath(workspace, destination.path, [savedId.current], destination.treeName, destination.treeType)
        setPaths(current => current.filter(item => item !== destination))
      }
      onSaved(fields.calendar.trim())
    } catch (err) {
      setError((savedId.current !== null && !doc ? 'Event created. Save again to finish pending changes: ' : '') + (err instanceof Error ? err.message : 'Failed to save the event'))
    } finally {
      setSaving(false)
    }
  }

  const title = isTask ? 'Task' : doc ? 'Event' : 'New event'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <span className="h-3 w-3 rounded-full" style={{ background: isTask ? calendarColor('tasks') : calendarColor(fields.calendar) }} />
        <span className="text-sm font-semibold">{title}</span>
        {doc && <span className="text-[10px] text-muted-foreground">#{doc.id}</span>}
        <span className="flex-1" />
        {doc && workspaceName && (
          <Link to={`/workspaces/${encodeURIComponent(workspaceName)}/documents/${doc.id}`} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Open document" aria-label="Open document">
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
        {(doc || resolvedWorkspace) && <button type="button" disabled={saving} onClick={() => setLinking(true)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Link to…" aria-label="Link to…"><Link2 className="h-3.5 w-3.5" /></button>}
        {doc && !isTask && <button type="button" disabled={saving} onClick={() => { void onDelete(doc) }} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" title="Delete (moves to trash)" aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>}
        <button type="button" onClick={onClose} disabled={saving} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>

      {isTask && doc ? (
        <TaskSummary doc={doc} occurrence={subject.occurrence} workspaceName={workspaceName} onSaved={() => onSaved('')} />
      ) : (
        <fieldset disabled={saving} className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto p-3">
          <input
            value={fields.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Title"
            autoFocus={!doc}
            spellCheck={false}
            className="w-full border-0 border-b border-border bg-transparent px-0 py-1 text-base font-semibold outline-none placeholder:text-muted-foreground/60 focus:border-ring"
          />

          <CalendarPicker value={fields.calendar} calendars={pickerCalendars} remote={remote} onChange={(calendar) => patch({ calendar })} />

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={fields.allDay}
              onChange={(e) => {
                const allDay = e.target.checked
                if (allDay) patch({ allDay, start: fields.start.slice(0, 10), end: (fields.end || fields.start).slice(0, 10) })
                else {
                  const day = fields.start.slice(0, 10) || dateKey(new Date())
                  const lastDay = (fields.end || day).slice(0, 10)
                  // A timed event over a selected span of days is a daily
                  // series across that span, not one event lasting days.
                  if (lastDay > day) patch({ allDay, start: `${day}T09:00`, end: `${day}T10:00`, repeat: fields.repeat === 'none' ? 'daily' : fields.repeat, until: lastDay, count: '' })
                  else patch({ allDay, start: `${day}T09:00`, end: `${day}T10:00` })
                }
              }}
              className="h-4 w-4 accent-primary"
            />
            All day
          </label>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="text-muted-foreground">Start</span>
              {fields.allDay
                ? <div className="mt-1"><DatePicker value={fields.start} onChange={(v) => patch({ start: v, end: fields.end && fields.end < v ? v : fields.end })} /></div>
                : <div className="mt-1"><DateTimePicker value={fields.start} onChange={(v) => patch({ start: v })} clearable={false} /></div>}
            </label>
            <label className="block text-xs">
              <span className="text-muted-foreground">End</span>
              {fields.allDay
                ? <div className="mt-1"><DatePicker value={fields.end} min={fields.start} placeholder="Same day" onChange={(v) => patch({ end: v })} /></div>
                : <div className="mt-1"><DateTimePicker value={fields.end} onChange={(v) => patch({ end: v })} placeholder="No end" /></div>}
            </label>
          </div>

          <label className="block text-xs">
            <span className="flex items-center gap-1 text-muted-foreground"><Repeat className="h-3 w-3" /> Repeat</span>
            <select value={fields.repeat} onChange={(e) => patch({ repeat: e.target.value as RepeatPreset, rrule: e.target.value === 'custom' ? (fields.rrule || presetRRule(fields.repeat) || 'FREQ=WEEKLY') : fields.rrule })} className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm">
              {REPEAT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            {fields.repeat === 'custom' && (
              <>
                <input value={fields.rrule} onChange={(e) => patch({ rrule: e.target.value })} placeholder="FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH" spellCheck={false} className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 font-mono text-xs" />
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{parseRRule(fields.rrule) ? describeRRule(parseRRule(fields.rrule)!) : 'RFC 5545 RRULE value'}</span>
              </>
            )}
          </label>
          {fields.repeat !== 'none' && fields.repeat !== 'custom' && (
            <RecurrenceEnds fields={fields} patch={patch} />
          )}

          <label className="block text-xs">
            <span className="text-muted-foreground">Location</span>
            <input value={fields.location} onChange={(e) => patch({ location: e.target.value })} spellCheck={false} className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm" />
          </label>

          <div className="text-xs">
            <span className="text-muted-foreground">Description</span>
            <div className="mt-1 rounded-md border border-input px-2 py-1.5">
              <GrowingTextarea value={fields.description} onChange={(v) => patch({ description: v })} placeholder="Notes, agenda, links…" />
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">Tags</span>
            <TagInput tags={tags} onChange={setTags} suggestions={suggestions} />
          </div>
          {!remote && <DocumentGeoField value={geo} onChange={setGeo} idPrefix="event-geo" label="Geotag" />}
          {doc && resolvedWorkspace
            ? <DocumentRelationsSection document={doc} workspaceId={resolvedWorkspace} />
            : <RelationFields f={relations} idPrefix="event" />}

          <div className="space-y-1.5">
            <button type="button" disabled={!resolvedWorkspace} onClick={() => setLinking(true)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50">
              <Link2 className="h-3.5 w-3.5" /> Link to…
            </button>
            {!doc && <p className="text-xs text-muted-foreground">Also file this event in project folders. Links are applied when you create it.</p>}
            {paths.map((destination, index) => <div key={`${destination.treeName}:${destination.path}`} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 break-all">[{destination.treeName}] {destination.path}</span>
              <button type="button" onClick={() => setPaths(current => current.filter((_, i) => i !== index))} aria-label={`Remove link to ${destination.path}`} className="rounded p-1 hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
            </div>)}
          </div>

          {synced && (
            <p className="rounded-md bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground">
              Synced from {synced.connector || synced.source}. Edits and deletes reach the source when write-back is enabled for it, and stay in Canvas otherwise.
              {link && <> <a href={link} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Open at source</a></>}
            </p>
          )}
          {subject.kind === 'occurrence' && subject.occurrence.unsupportedRule && (
            <p className="text-[11px] text-muted-foreground">This series uses RRULE parts the calendar cannot expand; only its first occurrence is shown.</p>
          )}
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        </fieldset>
      )}

      {!isTask && (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-3 py-2">
          <SaveState doc={doc} />
          <button type="button" onClick={onClose} disabled={saving} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className={cn('flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50')}>
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            {doc || created ? 'Save' : 'Create'}
          </button>
        </div>
      )}

      {linking && !doc && resolvedWorkspace && <LinkToSidePanel onClose={() => setLinking(false)}>
        <LinkToCard fixedWorkspaceName={resolvedWorkspace} sizeClassName={LINK_TO_SIDE_SIZE}
          title="Link event to…" confirmLabel="Add links" onClose={() => setLinking(false)}
          onConfirm={(selectedPaths, destination) => {
            setPaths(current => [...current, ...selectedPaths
              .filter(path => !current.some(item => item.path === path && item.treeName === destination.treeName))
              .map(path => ({ ...destination, path }))])
            setLinking(false)
          }} />
      </LinkToSidePanel>}
      {linking && doc && <LinkDocOverlay documentId={doc.id} workspaceName={workspaceName ?? undefined} onClose={() => setLinking(false)} />}
    </div>
  )
}

// How a preset series ends: never, on a last day, or after N occurrences.
function RecurrenceEnds({ fields, patch }: { fields: Fields; patch: (p: Partial<Fields>) => void }) {
  const mode = fields.until ? 'until' : fields.count ? 'count' : 'never'
  const startDay = fields.start.slice(0, 10)
  const summary = recurrenceOf(fields)
  const rule = summary ? parseRRule(summary) : null
  return (
    <div className="text-xs">
      <span className="text-muted-foreground">Ends</span>
      <div className="mt-1 flex items-center gap-1.5">
        <select
          value={mode}
          onChange={(e) => {
            const next = e.target.value
            if (next === 'never') patch({ until: '', count: '' })
            else if (next === 'until') patch({ until: fields.until || startDay, count: '' })
            else patch({ until: '', count: fields.count || '10' })
          }}
          className="h-8 w-28 shrink-0 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value="never">Never</option>
          <option value="until">On date</option>
          <option value="count">After</option>
        </select>
        {mode === 'until' && <div className="min-w-0 flex-1"><DatePicker value={fields.until} min={startDay} onChange={(v) => patch({ until: v })} /></div>}
        {mode === 'count' && (
          <label className="flex items-center gap-1.5">
            <input type="number" min={1} step={1} value={fields.count} onChange={(e) => patch({ count: e.target.value })} className="h-8 w-20 rounded-md border border-input bg-transparent px-2 text-sm tabular-nums" />
            <span className="text-muted-foreground">occurrences</span>
          </label>
        )}
      </div>
      {rule && <span className="mt-0.5 block text-[11px] text-muted-foreground">{describeRRule(rule)}</span>}
    </div>
  )
}

// Workspace calendars (facet + domain timelines) as a real dropdown, with a
// "New calendar…" entry that turns into a text field. A synced event whose
// calendar is not in the list keeps its own name as an extra option.
function CalendarPicker({ value, calendars, remote, onChange }: { value: string; calendars: string[]; remote?: CreateDestination; onChange: (name: string) => void }) {
  const known = calendars.some(c => c.toLowerCase() === value.toLowerCase())
  const [creating, setCreating] = useState(!known && !!value === false && calendars.length === 0)
  const options = known || !value ? calendars : [value, ...calendars]
  return (
    <label className="block text-xs">
      <span className="text-muted-foreground">Calendar</span>
      {creating ? (
        <span className="mt-1 flex gap-1">
          <input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="New calendar name"
            spellCheck={false}
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {calendars.length > 0 && (
            <button type="button" onClick={() => { setCreating(false); onChange(calendars[0]) }} className="rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-muted" aria-label="Pick an existing calendar">
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ) : (
        <select
          value={value}
          onChange={(e) => { if (e.target.value === '\u0000new') { setCreating(true); onChange('') } else onChange(e.target.value) }}
          className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {!value && <option value="">No calendar</option>}
          {options.map(c => <option key={c} value={c}>{c}</option>)}
          <option value={'\u0000new'}>New calendar…</option>
        </select>
      )}
      {remote && <span className="mt-0.5 block text-[11px] text-muted-foreground">Created on {remote.label}, then synced back into Canvas.</span>}
    </label>
  )
}

// A connector-synced event saves through its source — name it while it does.
function SaveState({ doc }: { doc: Document | null }) {
  const state = useMirrorSaveState(doc ?? ({ id: -1, locations: [] } as unknown as Document))
  if (!doc || !state.replicating) return null
  return <span className="mr-auto text-[10px] text-muted-foreground">{state.label}</span>
}

function TaskSummary({ doc, occurrence, workspaceName, onSaved }: { doc: Document; occurrence: Occurrence; workspaceName: string | null; onSaved: () => void }) {
  const [busy, setBusy] = useState(false)
  const done = occurrence.done
  const toggle = async () => {
    if (!workspaceName) return
    setBusy(true)
    try {
      const status = done ? 'pending' : 'completed'
      await updateWorkspaceDocument(workspaceName, {
        id: doc.id, schema: doc.schema, schemaVersion: doc.schemaVersion,
        data: { ...(doc.data ?? {}), status, completed: status === 'completed' }, metadata: doc.metadata,
      })
      onSaved()
    } finally { setBusy(false) }
  }
  return (
    <div className="space-y-3 p-3 text-sm">
      <div className="flex items-start gap-2">
        <button type="button" onClick={toggle} disabled={busy} className="mt-0.5 text-muted-foreground hover:text-foreground" aria-label={done ? 'Mark as pending' : 'Mark as completed'}>
          {done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4" />}
        </button>
        <div className="min-w-0">
          <p className={cn('font-semibold', done && 'line-through text-muted-foreground')}>{occurrence.title}</p>
          <p className="text-xs text-muted-foreground">Due {occurrence.start.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>
        </div>
      </div>
      {typeof doc.data?.description === 'string' && doc.data.description && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{doc.data.description}</p>}
      <p className="text-[11px] text-muted-foreground">Edit the task in the Todos app or on its document page.</p>
    </div>
  )
}
