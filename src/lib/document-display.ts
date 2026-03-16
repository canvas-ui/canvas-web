import type { Document } from '@/types/workspace'

const EMAIL_SCHEMA = 'data/abstraction/email'
const TAB_SCHEMA = 'data/abstraction/tab'

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

  return {
    title: truncate(document.data.title || document.data.name || document.data.filename || document.data.subject, 160) || `Document ${document.id}`,
    preview: truncate(document.data.content || document.data.description || document.data.summary || document.data.bodyPreview || document.data.body, 140),
    subtitle: '',
    icon: 'file',
    isExternal: false,
    schemaLabel,
  }
}
