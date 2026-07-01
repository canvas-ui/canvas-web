import type { Document } from '@/types/workspace'

const EMAIL_SCHEMA = 'data/abstraction/email'
const TAB_SCHEMA = 'data/abstraction/tab'
export const FILE_SCHEMA = 'data/abstraction/file'

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

// Filename for a blob doc. `stored://` locations are content-addressed (the
// URL's path is a hash, not a name), so the human filename lives on
// locations[0].metadata.filename instead — set at upload time (see
// services/blobs.ts callers). Fall back to the URL basename for location
// schemes where the path IS the name (e.g. file:// from `ws add`).
export function isImageFile(document: Document): boolean {
  if (document.schema !== FILE_SCHEMA) return false
  return String(document.metadata?.contentType || '').startsWith('image/')
}

export function getLocationFilename(document: Document): string {
  const location = document.locations?.[0]
  if (!location) return ''

  const metaFilename = String(location.metadata?.filename || '').trim()
  if (metaFilename) return metaFilename

  const url = location.url
  if (!url) return ''
  const afterScheme = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  const slash = afterScheme.indexOf('/')
  const key = slash >= 0 ? afterScheme.slice(slash + 1) : afterScheme
  const base = key.split('/').filter(Boolean).pop()
  if (!base) return ''
  try { return decodeURIComponent(base) } catch { return base }
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
