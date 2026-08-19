import { useState } from 'react'
import { tagsToFeatures } from './tags'
import { submitDocuments, type AddTarget } from './useAddTarget'
import { IDENTITY_SCHEMA } from '@/components/renderers/types'

const IDENTITY_SCHEMA_VERSION = '3.0'

// Mirrors synapsd Identity.js `data.type` (the subtype axis — it is `type`, not
// `kind`, because `kind` is a reserved facet namespace).
export const IDENTITY_TYPES = ['person', 'organization', 'service', 'bot'] as const
export type IdentityType = (typeof IDENTITY_TYPES)[number]

export const IDENTITY_TYPE_LABELS: Record<IdentityType, string> = {
  person: 'Person',
  organization: 'Organization',
  service: 'Service',
  bot: 'Bot',
}

// Channel kinds the UI offers. The schema takes any string, so this is a
// convenience list, not a constraint — a connector may write others and the
// renderer shows them fine.
export const CHANNEL_KINDS = ['email', 'phone', 'sms', 'chat', 'web'] as const

// Identifier types likewise: the shapes the extraction work will actually
// produce, offered first so hand-entry matches what the machines write.
export const IDENTIFIER_TYPES = ['email', 'github', 'slack', 'matrix', 'gpg', 'url'] as const

export interface ChannelRow {
  kind: string
  value: string
  label?: string
  primary?: boolean
}

export interface IdentifierRow {
  type: string
  identifier: string
  provider?: string
  primary?: boolean
}

export interface OrganizationRow {
  name: string
  role?: string
}

export interface IdentityFieldValues {
  displayName: string
  type: IdentityType
  primaryEmail: string
  given: string
  family: string
  channels: ChannelRow[]
  identifiers: IdentifierRow[]
  organizations: OrganizationRow[]
}

/**
 * Build the identity `data` payload from field state — shared by every add
 * surface and by the object card's edit form.
 *
 * The primary email is mirrored into a primary email CHANNEL, which is what
 * `Identity`'s own `primaryEmail` setter does server-side. Nothing runs that
 * setter on a plain JSON POST (the constructor only normalizes arrays), so if
 * the UI did not mirror it the two fields would disagree: the getter would find
 * the address but a channel list would not show it.
 */
export function buildIdentityData(fields: IdentityFieldValues): Record<string, unknown> {
  const email = fields.primaryEmail.trim().toLowerCase()
  const channels = fields.channels
    .map((c) => ({ ...c, kind: c.kind.trim(), value: c.value.trim(), label: c.label?.trim() || undefined }))
    .filter((c) => c.kind && c.value)

  if (email && !channels.some((c) => c.kind === 'email' && c.value === email)) {
    // Demote any other primary email first — the schema allows one per kind.
    for (const c of channels) { if (c.kind === 'email') c.primary = false }
    channels.push({ kind: 'email', value: email, label: undefined, primary: true })
  }

  const given = fields.given.trim()
  const family = fields.family.trim()

  return {
    displayName: fields.displayName.trim(),
    type: fields.type,
    ...(email ? { primaryEmail: email } : {}),
    ...(given || family ? { name: { ...(given ? { given } : {}), ...(family ? { family } : {}) } } : {}),
    channels,
    identifiers: fields.identifiers
      .map((i) => ({ ...i, type: i.type.trim(), identifier: i.identifier.trim(), provider: i.provider?.trim() || undefined }))
      .filter((i) => i.type && i.identifier),
    organizations: fields.organizations
      .map((o) => ({ ...o, name: o.name.trim(), role: o.role?.trim() || undefined }))
      .filter((o) => o.name),
  }
}

/**
 * Seed field state from a stored identity document — the object card's edit
 * form. `name` is the structured object, so given/family are lifted out of it;
 * everything the form does not surface (links, properties, timezone, locale,
 * lastInteractionAt) is left in `data` untouched by the caller's spread.
 */
export function identityFieldsFromDocument(data: Record<string, unknown> | undefined): Partial<IdentityFieldValues> {
  const d = data ?? {}
  const name = (d.name && typeof d.name === 'object' ? d.name : {}) as Record<string, unknown>
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : [])
  const type = String(d.type || 'person')
  return {
    displayName: String(d.displayName || ''),
    type: (IDENTITY_TYPES as readonly string[]).includes(type) ? type as IdentityType : 'person',
    primaryEmail: String(d.primaryEmail || ''),
    given: String(name.given || ''),
    family: String(name.family || ''),
    channels: arr<ChannelRow>(d.channels),
    identifiers: arr<IdentifierRow>(d.identifiers),
    organizations: arr<OrganizationRow>(d.organizations),
  }
}

/** Field state + doc-building + submit, shared by IdentityForm and the home card. */
export function useIdentityFields(initial?: Partial<IdentityFieldValues>) {
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '')
  const [type, setType] = useState<IdentityType>(initial?.type ?? 'person')
  const [primaryEmail, setPrimaryEmail] = useState(initial?.primaryEmail ?? '')
  const [given, setGiven] = useState(initial?.given ?? '')
  const [family, setFamily] = useState(initial?.family ?? '')
  const [channels, setChannels] = useState<ChannelRow[]>(initial?.channels ?? [])
  const [identifiers, setIdentifiers] = useState<IdentifierRow[]>(initial?.identifiers ?? [])
  const [organizations, setOrganizations] = useState<OrganizationRow[]>(initial?.organizations ?? [])
  const [tags, setTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  const values: IdentityFieldValues = { displayName, type, primaryEmail, given, family, channels, identifiers, organizations }

  // An email that is typed but malformed is worth blocking on: the schema
  // validates `primaryEmail` server-side, so saving would 400 rather than fail
  // in a way the form can explain.
  const emailValid = !primaryEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primaryEmail.trim())
  const canSave = displayName.trim().length > 0 && emailValid && !saving

  async function save(target: AddTarget): Promise<number[]> {
    setSaving(true)
    try {
      const trimmedComment = comment.trim()
      const doc = {
        schema: IDENTITY_SCHEMA,
        schemaVersion: IDENTITY_SCHEMA_VERSION,
        data: buildIdentityData(values),
        ...(trimmedComment ? { comment: trimmedComment } : {}),
        metadata: { features: tagsToFeatures(tags) },
      }
      return await submitDocuments(target, [doc])
    } finally {
      setSaving(false)
    }
  }

  return {
    displayName, setDisplayName, type, setType, primaryEmail, setPrimaryEmail,
    given, setGiven, family, setFamily,
    channels, setChannels, identifiers, setIdentifiers, organizations, setOrganizations,
    tags, setTags, comment, setComment,
    values, saving, canSave, emailValid, save,
  }
}
