import { Plus, Trash2, Star } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  IDENTITY_TYPES, IDENTITY_TYPE_LABELS, CHANNEL_KINDS, IDENTIFIER_TYPES,
  type IdentityType, type ChannelRow, type IdentifierRow, type OrganizationRow,
} from './useIdentityFields'

const SELECT_CLASS = 'h-9 shrink-0 rounded-md border border-input bg-transparent px-2 text-sm shadow-elevation-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

// A repeatable row list (channels / identifiers / organizations). Adding and
// removing rows is the whole interaction, so it lives here once rather than
// three times — the only per-section difference is what a blank row looks like
// and how its fields render.
function RowList<T>({ label, rows, onChange, blank, addLabel, children }: {
  label: string
  rows: T[]
  onChange: (rows: T[]) => void
  blank: () => T
  addLabel: string
  children: (row: T, update: (patch: Partial<T>) => void) => React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <button
          type="button"
          onClick={() => onChange([...rows, blank()])}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> {addLabel}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">None yet.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-1.5">
              {children(row, (patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))))}
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Remove ${label.toLowerCase()} row`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Exactly one primary per channel kind (the schema enforces it on write) — so
// starring one demotes the others of the same kind rather than just toggling.
function togglePrimary(rows: ChannelRow[], index: number): ChannelRow[] {
  const kind = rows[index].kind
  const wasPrimary = rows[index].primary
  return rows.map((r, i) => (r.kind === kind ? { ...r, primary: !wasPrimary && i === index } : r))
}

export interface IdentityFieldsProps {
  idPrefix: string
  displayName: string; setDisplayName: (v: string) => void
  type: IdentityType; setType: (v: IdentityType) => void
  primaryEmail: string; setPrimaryEmail: (v: string) => void
  given: string; setGiven: (v: string) => void
  family: string; setFamily: (v: string) => void
  channels: ChannelRow[]; setChannels: (v: ChannelRow[]) => void
  identifiers: IdentifierRow[]; setIdentifiers: (v: IdentifierRow[]) => void
  organizations: OrganizationRow[]; setOrganizations: (v: OrganizationRow[]) => void
  emailValid?: boolean
}

/** The identity field group — shared by the AddPanel form, the home quick-add
 *  card and the object card's edit form, so all three stay identical. */
export function IdentityFields({
  idPrefix, displayName, setDisplayName, type, setType, primaryEmail, setPrimaryEmail,
  given, setGiven, family, setFamily, channels, setChannels,
  identifiers, setIdentifiers, organizations, setOrganizations, emailValid = true,
}: IdentityFieldsProps) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-display-name`}>Display name</Label>
        <Input
          id={`${idPrefix}-display-name`}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Jane Doe, Acme Ltd, build-bot…"
          autoFocus
        />
      </div>

      <div className="flex gap-2">
        <div className="w-40 space-y-1.5">
          <Label htmlFor={`${idPrefix}-type`}>Type</Label>
          <select
            id={`${idPrefix}-type`}
            value={type}
            onChange={(e) => setType(e.target.value as IdentityType)}
            className={cn(SELECT_CLASS, 'w-full')}
          >
            {IDENTITY_TYPES.map((t) => <option key={t} value={t}>{IDENTITY_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor={`${idPrefix}-email`}>Primary email</Label>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            value={primaryEmail}
            onChange={(e) => setPrimaryEmail(e.target.value)}
            placeholder="jane@example.com"
          />
          {!emailValid && <p className="text-xs text-destructive">Enter a valid email address.</p>}
        </div>
      </div>

      {/* Structured name is only meaningful for a person; an organization has a
          display name and nothing to split. */}
      {type === 'person' && (
        <div className="flex gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor={`${idPrefix}-given`}>Given name</Label>
            <Input id={`${idPrefix}-given`} value={given} onChange={(e) => setGiven(e.target.value)} placeholder="Jane" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor={`${idPrefix}-family`}>Family name</Label>
            <Input id={`${idPrefix}-family`} value={family} onChange={(e) => setFamily(e.target.value)} placeholder="Doe" />
          </div>
        </div>
      )}

      <RowList<ChannelRow>
        label="Channels"
        rows={channels}
        onChange={setChannels}
        blank={() => ({ kind: 'email', value: '' })}
        addLabel="Add channel"
      >
        {(row, update) => (
          <>
            <select value={row.kind} onChange={(e) => update({ kind: e.target.value })} className={cn(SELECT_CLASS, 'w-24')}>
              {CHANNEL_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              {!CHANNEL_KINDS.includes(row.kind as typeof CHANNEL_KINDS[number]) && <option value={row.kind}>{row.kind}</option>}
            </select>
            <Input
              value={row.value}
              onChange={(e) => update({ value: e.target.value })}
              placeholder={row.kind === 'phone' ? '+421…' : 'address or handle'}
              className="min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={() => setChannels(togglePrimary(channels, channels.indexOf(row)))}
              className={cn('shrink-0 rounded p-1.5 transition-colors hover:bg-muted', row.primary ? 'text-data-5' : 'text-muted-foreground')}
              title={row.primary ? 'Primary for this kind' : 'Make primary for this kind'}
              aria-pressed={!!row.primary}
            >
              <Star className={cn('h-3.5 w-3.5', row.primary && 'fill-current')} />
            </button>
          </>
        )}
      </RowList>

      <RowList<IdentifierRow>
        label="Identifiers"
        rows={identifiers}
        onChange={setIdentifiers}
        blank={() => ({ type: 'github', identifier: '' })}
        addLabel="Add identifier"
      >
        {(row, update) => (
          <>
            <select value={row.type} onChange={(e) => update({ type: e.target.value })} className={cn(SELECT_CLASS, 'w-24')}>
              {IDENTIFIER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              {!IDENTIFIER_TYPES.includes(row.type as typeof IDENTIFIER_TYPES[number]) && <option value={row.type}>{row.type}</option>}
            </select>
            <Input
              value={row.identifier}
              onChange={(e) => update({ identifier: e.target.value })}
              placeholder="octocat, U024BE7LH, 0xABCD…"
              className="min-w-0 flex-1 font-mono text-xs"
            />
          </>
        )}
      </RowList>

      <RowList<OrganizationRow>
        label="Organizations"
        rows={organizations}
        onChange={setOrganizations}
        blank={() => ({ name: '' })}
        addLabel="Add organization"
      >
        {(row, update) => (
          <>
            <Input value={row.name} onChange={(e) => update({ name: e.target.value })} placeholder="Acme Ltd" className="min-w-0 flex-1" />
            <Input value={row.role ?? ''} onChange={(e) => update({ role: e.target.value })} placeholder="Role" className="w-32 shrink-0" />
          </>
        )}
      </RowList>
    </>
  )
}
