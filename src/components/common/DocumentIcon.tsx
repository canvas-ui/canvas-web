import { cn } from '@/lib/utils'
import type { Document } from '@/types/workspace'
import { getDocumentIconSpec } from './document-icon-utils'

interface DocumentIconProps {
  document: Pick<Document, 'schema' | 'metadata'>
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

export function DocumentIcon({ document, size = 4, chip = false, className }: DocumentIconProps) {
  const spec = getDocumentIconSpec(document)
  const glyph = <spec.Icon className={cn(SIZE_CLASS[size], spec.color, !chip && 'shrink-0', !chip && className)} />
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
