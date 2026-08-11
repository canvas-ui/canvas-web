import type { Document } from '@/types/workspace'

const EMAIL_SCHEMA = 'data/schema/message/email'
const TAB_SCHEMA = 'data/schema/tab'
export const FILE_SCHEMA = 'data/schema/file'

type DisplayIcon = 'file' | 'globe' | 'mail'

function truncate(value: unknown, maxLength: number): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
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
    preview: truncate(document.data.content || document.data.description || document.data.summary || document.data.bodyPreview || document.data.body, 140),
    subtitle: '',
    icon: 'file',
    isExternal: false,
    schemaLabel,
  }
}
