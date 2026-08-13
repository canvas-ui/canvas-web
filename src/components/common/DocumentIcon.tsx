import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Document } from '@/types/workspace'
import { getDocumentIconSpec } from './document-icon-spec'

interface DocumentIconProps {
  document: Pick<Document, 'schema' | 'metadata'> & { data?: Document['data'] }
  /** Glyph size (tailwind h-/w- value), default 4 (1rem). */
  size?: 3.5 | 4 | 5 | 10
  /** Wrap the glyph in a soft colored chip (list rows). */
  chip?: boolean
  className?: string
}

const SIZE_CLASS: Record<NonNullable<DocumentIconProps['size']>, string> = {
  3.5: 'h-3.5 w-3.5',
  4: 'h-4 w-4',
  5: 'h-5 w-5',
  10: 'h-10 w-10',
}

// Favicon candidates for a tab document: the URL the browser extension stored
// (tab.favIconUrl), then the site's conventional /favicon.ico. Both load as
// plain <img> straight from the client (CSP already allows https: images —
// same path LinkCardRenderer uses), so the server is never involved.
function faviconCandidates(data?: Document['data']): string[] {
  const out: string[] = []
  const stored = typeof data?.favIconUrl === 'string' ? data.favIconUrl : ''
  if (/^https?:\/\//i.test(stored)) out.push(stored)
  const url = typeof data?.url === 'string' ? data.url : ''
  try {
    const origin = new URL(url).origin
    if (/^https?:/i.test(origin)) {
      const guess = `${origin}/favicon.ico`
      if (!out.includes(guess)) out.push(guess)
    }
  } catch { /* not a parseable URL — glyph fallback */ }
  return out
}

export function DocumentIcon({ document, size = 4, chip = false, className }: DocumentIconProps) {
  const spec = getDocumentIconSpec(document)
  const isTab = document.schema === 'data/schema/tab'
  const candidates = isTab ? faviconCandidates(document.data) : []
  // Walk the candidate list on load errors; past the end = default glyph.
  const [candidateIdx, setCandidateIdx] = useState(0)
  const faviconUrl = candidates[candidateIdx] ?? null

  const glyph = faviconUrl ? (
    <img
      src={faviconUrl}
      alt=""
      loading="lazy"
      onError={() => setCandidateIdx((i) => i + 1)}
      className={cn(SIZE_CLASS[size], 'rounded-xs object-contain', !chip && 'shrink-0', !chip && className)}
    />
  ) : (
    <spec.Icon className={cn(SIZE_CLASS[size], spec.color, !chip && 'shrink-0', !chip && className)} />
  )
  if (!chip) return glyph
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md',
        size >= 10 ? 'p-3' : 'p-1',
        spec.chip,
        className,
      )}
    >
      {glyph}
    </span>
  )
}
