import {
  File,
  FileText,
  FileArchive,
  FileCode,
  Globe,
  Mail,
  StickyNote,
  CheckSquare,
  MessageSquare,
  User,
  Image,
  Film,
  Music,
  Monitor,
  Package,
  Settings2,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Document } from '@/types/workspace'

// Per-type icon + color for documents. Color is a first-class visual cue on
// the otherwise monochrome UI: each abstraction owns a hue, files pick theirs
// from the mime type. The same hues will later color context/directory path
// cues in the multi-context layout — keep this map the single source of truth.

interface IconSpec {
  Icon: LucideIcon
  color: string // text color of the glyph
  chip: string // soft background for the chip variant
}

const SPECS: Record<string, IconSpec> = {
  tab: { Icon: Globe, color: 'text-sky-500', chip: 'bg-sky-500/15' },
  link: { Icon: Globe, color: 'text-sky-500', chip: 'bg-sky-500/15' },
  email: { Icon: Mail, color: 'text-amber-500', chip: 'bg-amber-500/15' },
  note: { Icon: StickyNote, color: 'text-yellow-500', chip: 'bg-yellow-500/15' },
  todo: { Icon: CheckSquare, color: 'text-green-500', chip: 'bg-green-500/15' },
  message: { Icon: MessageSquare, color: 'text-cyan-500', chip: 'bg-cyan-500/15' },
  contact: { Icon: User, color: 'text-orange-500', chip: 'bg-orange-500/15' },
  device: { Icon: Monitor, color: 'text-violet-500', chip: 'bg-violet-500/15' },
  application: { Icon: Package, color: 'text-purple-500', chip: 'bg-purple-500/15' },
  dotfile: { Icon: Settings2, color: 'text-lime-600', chip: 'bg-lime-500/15' },
  document: { Icon: FileText, color: 'text-indigo-500', chip: 'bg-indigo-500/15' },
}

const FILE_BY_MIME: Array<{ test: RegExp; spec: IconSpec }> = [
  { test: /^image\//, spec: { Icon: Image, color: 'text-emerald-500', chip: 'bg-emerald-500/15' } },
  { test: /^video\//, spec: { Icon: Film, color: 'text-rose-500', chip: 'bg-rose-500/15' } },
  { test: /^audio\//, spec: { Icon: Music, color: 'text-fuchsia-500', chip: 'bg-fuchsia-500/15' } },
  { test: /pdf$/, spec: { Icon: FileText, color: 'text-red-500', chip: 'bg-red-500/15' } },
  { test: /zip|tar|gzip|7z|rar|compressed/, spec: { Icon: FileArchive, color: 'text-stone-500', chip: 'bg-stone-500/15' } },
  { test: /json|javascript|typescript|xml|html|css|x-sh|python/, spec: { Icon: FileCode, color: 'text-teal-500', chip: 'bg-teal-500/15' } },
  { test: /^text\//, spec: { Icon: FileText, color: 'text-slate-500', chip: 'bg-slate-500/15' } },
]

const FILE_FALLBACK: IconSpec = { Icon: File, color: 'text-teal-600', chip: 'bg-teal-500/15' }
const GENERIC: IconSpec = { Icon: File, color: 'text-indigo-500', chip: 'bg-indigo-500/15' }

export function getDocumentIconSpec(doc: Pick<Document, 'schema' | 'metadata'>): IconSpec {
  const kind = (doc.schema || '').split('/').pop() || ''
  if (kind === 'file') {
    const mime = String(doc.metadata?.contentType || '').toLowerCase()
    return FILE_BY_MIME.find(({ test }) => test.test(mime))?.spec || FILE_FALLBACK
  }
  return SPECS[kind] || GENERIC
}

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
