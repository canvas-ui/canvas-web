import type { Document } from '@/types/workspace'

const EMAIL_SCHEMA = 'data/schema/message/email'
const TAB_SCHEMA = 'data/schema/tab'
const TASK_SCHEMA = 'data/schema/task'
const IDENTITY_SCHEMA = 'data/schema/identity'
export const FILE_SCHEMA = 'data/schema/file'

type DisplayIcon = 'file' | 'globe' | 'mail'

function truncate(value: unknown, maxLength: number): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

// Note bodies are markdown; previews should read as plain text, not syntax.
// Deliberately lossy — just enough to keep tiles/rows clean.
function stripMarkdown(value: unknown): string {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')          // fenced code blocks
    .replace(/`([^`]*)`/g, '$1')              // inline code
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images → alt text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // links → link text
    .replace(/^#{1,6}\s+/gm, '')              // heading markers
    .replace(/^\s*>\s?/gm, '')                // blockquote markers
    .replace(/^\s*[-*+]\s+/gm, '')            // list bullets
    .replace(/(\*\*|__|\*|_|~~)/g, '')        // emphasis/strikethrough
}

function formatEmailParty(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(formatEmailParty).filter(Boolean).join(', ')
  if (typeof value === 'object') {
    const party = value as { address?: string; name?: string }
    const address = String(party.address || '').trim()
    const name = String(party.name || '').trim()
    if (name && address && name !== address) return `${name} <${address}>`
    return name || address
  }
  return ''
}

// "3 channels · 1 identifier" — the shape of what we hold on someone, which is
// the thing you scan a contact list for. Counting beats listing: a person with
// six addresses would otherwise blow the row width.
function identityHoldings(data: Document['data']): string {
  const channels = Array.isArray(data?.channels) ? data.channels.length : 0
  const identifiers = Array.isArray(data?.identifiers) ? data.identifiers.length : 0
  const orgs = Array.isArray(data?.organizations) ? data.organizations.length : 0
  return [
    channels ? `${channels} channel${channels !== 1 ? 's' : ''}` : '',
    identifiers ? `${identifiers} identifier${identifiers !== 1 ? 's' : ''}` : '',
    orgs ? `${orgs} organization${orgs !== 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · ')
}

// `data.name` on an identity is a STRUCTURED object ({given, family, …}), not a
// string like on every other schema — passing it to truncate() would render a
// literal "[object Object]". Compose it instead.
function identityName(data: Document['data']): string {
  const display = String(data?.displayName || '').trim()
  if (display) return display
  const n = data?.name
  if (!n || typeof n !== 'object') return String(n || '').trim()
  const parts = n as Record<string, unknown>
  return [parts.prefix, parts.given, parts.middle, parts.family, parts.suffix]
    .map((p) => String(p || '').trim()).filter(Boolean).join(' ')
}

// An identity's own address, whether it was set as `primaryEmail` or only ever
// arrived as a primary email channel — the schema's getter reads both, and a
// row that showed a blank because the value sat in the other field would look
// like missing data.
function identityEmail(data: Document['data']): string {
  const direct = String(data?.primaryEmail || '').trim()
  if (direct) return direct
  const channels = Array.isArray(data?.channels) ? data.channels : []
  const primary = channels.find((c) => c?.kind === 'email' && c?.primary) || channels.find((c) => c?.kind === 'email')
  return String(primary?.value || '').trim()
}

function getTabTitle(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}${parsed.pathname}`
  } catch {
    return url
  }
}

export function isImageFile(document: Document): boolean {
  if (document.schema !== FILE_SCHEMA) return false
  return String(document.metadata?.contentType || '').startsWith('image/')
}

// Basename of a location URL, for schemes where the path IS a name (file://
// from `ws add`, https://, smb://). A `stored://` key is only sometimes one:
// file-backed keys are the real workspace path, cacache/auto-generated keys are
// content hashes — so a stored key must look like a filename to count.
function nameBearingBasename(url?: string): string {
  if (!url) return ''
  const afterScheme = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  const slash = afterScheme.indexOf('/')
  const key = slash >= 0 ? afterScheme.slice(slash + 1) : afterScheme
  const base = key.split('/').filter(Boolean).pop()
  if (!base) return ''
  let decoded: string
  try { decoded = decodeURIComponent(base) } catch { decoded = base }
  if (/^stored:\/\//i.test(url) && !looksLikeFilename(decoded)) return ''
  return decoded
}

// A name a person would recognise: has an extension and isn't a bare digest.
function looksLikeFilename(base: string): boolean {
  return /\.[A-Za-z0-9]{1,12}$/.test(base) && !/^[a-f0-9]{16,}$/i.test(base.replace(/\.[^.]*$/, ''))
}

/**
 * The name to display for a document.
 *
 * The same bytes may be called something different at every location, and
 * `locations` is append-ordered and rebuilt per backend scan — so position must
 * never decide: reading locations[0] made a file rename itself to a content
 * hash as soon as a mirror was added ahead of it. Order:
 *
 *   1. the document's own name (`metadata.filename`) — set by a rename;
 *   2. `data.filename` — the same idea for JSON abstractions;
 *   3. the name on the canvas-owned copy (`stored://workspace:*`);
 *   4. any location name, by a STABLE sort (url), never array order;
 *   5. the URL basename, where the path really is a name (a `stored://` key
 *      counts only when it looks like a filename, not a content hash).
 *
 * Mirrors `displayFilename()` in the server's webdav/vfs-shared.js — keep them
 * in step.
 */
export function getLocationFilename(document: Document): string {
  const own = String(document.metadata?.filename || '').trim()
  if (own) return own

  const dataName = String((document.data as { filename?: unknown })?.filename || '').trim()
  if (dataName) return dataName

  const locations = (document.locations || []).filter(Boolean)
  const owned = locations.find(location => /^stored:\/\/workspace:/i.test(location.url || ''))
  const ownedName = String(owned?.metadata?.filename || '').trim()
  if (ownedName) return ownedName

  const stable = [...locations].sort((a, b) => String(a.url || '').localeCompare(String(b.url || '')))
  const named = stable.find(location => String(location.metadata?.filename || '').trim())
  if (named) return String(named.metadata?.filename || '').trim()

  for (const location of stable) {
    const base = nameBearingBasename(location.url)
    if (base) return base
  }
  return ''
}

/**
 * The document's original home on the web, if it has one: a tab/link's own
 * URL, a connector doc's permalink (GitHub issue page, calendar event link…),
 * or any https location recorded on it. Null for purely local documents.
 */
export function getExternalUrl(document: Document): string | null {
  const data = document.data as { url?: unknown; htmlUrl?: unknown; htmlLink?: unknown }
  for (const candidate of [data.url, data.htmlUrl, data.htmlLink]) {
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) return candidate
  }
  for (const location of document.locations || []) {
    if (typeof location?.url === 'string' && /^https?:\/\//i.test(location.url)) return location.url
  }
  return null
}

export function getDocumentDisplayInfo(document: Document): {
  title: string
  preview: string
  subtitle: string
  icon: DisplayIcon
  isExternal: boolean
  schemaLabel: string
} {
  const isEmail = document.schema === EMAIL_SCHEMA
  const isTab = document.schema === TAB_SCHEMA
  const schemaLabel = document.schema.split('/').pop() || document.schema

  if (isEmail) {
    return {
      title: truncate(document.data.title || document.data.name || document.data.subject, 160) || `Email ${document.id}`,
      preview: truncate(document.data.bodyPreview || document.data.body || '', 140),
      subtitle: truncate(formatEmailParty(document.data.from), 120),
      icon: 'mail',
      isExternal: false,
      schemaLabel,
    }
  }

  if (isTab) {
    const title = String(document.data.title || document.data.name || '').trim()
    const url = String(document.data.url || '').trim()
    return {
      title: title || getTabTitle(url) || `Document ${document.id}`,
      preview: truncate(document.data.description || document.data.summary || url, 140),
      subtitle: url,
      icon: 'globe',
      isExternal: Boolean(url),
      schemaLabel,
    }
  }

  if (document.schema === TASK_SCHEMA || document.schema.startsWith(`${TASK_SCHEMA}/`)) {
    const status = String(document.data.status || (document.data.completed ? 'completed' : 'pending')).trim()
    const due = document.data.dueDate ? new Date(String(document.data.dueDate)) : null
    const dueLabel = due && !Number.isNaN(due.getTime())
      ? due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : ''
    return {
      title: truncate(document.data.title || document.data.name, 160) || `Task ${document.id}`,
      preview: truncate(stripMarkdown(document.data.description || document.data.summary), 400),
      subtitle: [status, dueLabel ? `due ${dueLabel}` : ''].filter(Boolean).join(' · '),
      icon: 'file',
      isExternal: false,
      schemaLabel,
    }
  }

  if (document.schema === IDENTITY_SCHEMA || document.schema.startsWith(`${IDENTITY_SCHEMA}/`)) {
    const email = identityEmail(document.data)
    const type = String(document.data.type || '').trim()
    return {
      title: truncate(identityName(document.data), 160) || `Identity ${document.id}`,
      preview: truncate(identityHoldings(document.data), 140),
      subtitle: [email, type].filter(Boolean).join(' · '),
      icon: email ? 'mail' : 'file',
      isExternal: false,
      schemaLabel,
    }
  }

  if (document.schema === FILE_SCHEMA) {
    const filename = getLocationFilename(document)
    const mime = String(document.metadata?.contentType || '').trim()
    const size = document.metadata?.size
    const previewParts = [
      mime,
      Number.isFinite(size) ? `${size} bytes` : '',
    ].filter(Boolean)
    return {
      title: truncate(filename, 160) || `File ${document.id}`,
      preview: previewParts.join(' · '),
      subtitle: filename,
      icon: 'file',
      isExternal: false,
      schemaLabel,
    }
  }

  return {
    title: truncate(document.data.title || document.data.name || document.data.subject || getLocationFilename(document), 160) || `Document ${document.id}`,
    // 400 chars: enough body for a tile to fill its clamped preview area; the
    // row view clamps to 2 lines anyway, so the extra length costs nothing.
    preview: truncate(stripMarkdown(document.data.content || document.data.description || document.data.summary || document.data.bodyPreview || document.data.body), 400),
    subtitle: '',
    icon: 'file',
    isExternal: false,
    schemaLabel,
  }
}
