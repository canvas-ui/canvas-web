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
import type { Document } from '@/types/workspace'

// Per-type icon + color for documents. Color is a first-class visual cue on
// the otherwise monochrome UI: each abstraction owns a hue, files pick theirs
// from the mime type. The same hues will later color context/directory path
// cues in the multi-context layout — keep this map the single source of truth.
//
// Hues come from the theme's categorical data palette (--color-data-N), not
// from semantic roles. A to-do is not "success" and a PDF is not "danger" —
// they are just different categories, and borrowing a status colour for them
// made the UI say things it didn't mean. The palette is contrast-tuned per
// scheme and collapses toward the foreground under the high-contrast theme;
// see src/theme/css/data-palette.css.

export interface IconSpec {
  Icon: LucideIcon
  color: string // text color of the glyph
  chip: string // soft background for the chip variant
}

// Written out literally rather than built with a template string: Tailwind
// discovers classes by scanning source text, so an interpolated
// `text-data-${n}` would compile to nothing at all.
const DATA_SLOTS = [
  { color: 'text-data-1', chip: 'bg-data-1/15' },
  { color: 'text-data-2', chip: 'bg-data-2/15' },
  { color: 'text-data-3', chip: 'bg-data-3/15' },
  { color: 'text-data-4', chip: 'bg-data-4/15' },
  { color: 'text-data-5', chip: 'bg-data-5/15' },
  { color: 'text-data-6', chip: 'bg-data-6/15' },
  { color: 'text-data-7', chip: 'bg-data-7/15' },
  { color: 'text-data-8', chip: 'bg-data-8/15' },
  { color: 'text-data-9', chip: 'bg-data-9/15' },
  { color: 'text-data-10', chip: 'bg-data-10/15' },
  { color: 'text-data-11', chip: 'bg-data-11/15' },
  { color: 'text-data-12', chip: 'bg-data-12/15' },
] as const

/** Pair the glyph and chip colours so a slot can never be half-applied. */
function slot(Icon: LucideIcon, n: number): IconSpec {
  return { Icon, ...DATA_SLOTS[n - 1] }
}

const SPECS: Record<string, IconSpec> = {
  tab: slot(Globe, 7),
  link: slot(Globe, 7),
  email: slot(Mail, 3),
  note: slot(StickyNote, 3),
  task: slot(CheckSquare, 5),
  message: slot(MessageSquare, 6),
  contact: slot(User, 2),
  device: slot(Monitor, 10),
  application: slot(Package, 11),
  dotfile: slot(Settings2, 4),
  document: slot(FileText, 9),
}

const FILE_BY_MIME: Array<{ test: RegExp; spec: IconSpec }> = [
  { test: /^image\//, spec: slot(Image, 5) },
  { test: /^video\//, spec: slot(Film, 11) },
  { test: /^audio\//, spec: slot(Music, 10) },
  { test: /pdf$/, spec: slot(FileText, 1) },
  { test: /zip|tar|gzip|7z|rar|compressed/, spec: slot(FileArchive, 12) },
  { test: /json|javascript|typescript|xml|html|css|x-sh|python/, spec: slot(FileCode, 6) },
  { test: /^text\//, spec: slot(FileText, 12) },
]

const FILE_FALLBACK: IconSpec = slot(File, 6)
const GENERIC: IconSpec = slot(File, 9)

export function getDocumentIconSpec(doc: Pick<Document, 'schema' | 'metadata'>): IconSpec {
  const kind = (doc.schema || '').split('/').pop() || ''
  if (kind === 'file') {
    const mime = String(doc.metadata?.contentType || '').toLowerCase()
    return FILE_BY_MIME.find(({ test }) => test.test(mime))?.spec || FILE_FALLBACK
  }
  return SPECS[kind] || GENERIC
}
