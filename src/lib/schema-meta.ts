import { FileText, StickyNote, ListTodo, Globe, Mail, Link as LinkIcon, Tag as TagIcon, type LucideIcon } from 'lucide-react'

// Friendly label + icon per known document-type (`data/abstraction/*`) schema.
// Shared by the toolbox Features picker and the map filter (pin icons), so a
// note reads the same everywhere. Unknown abstractions fall back to a generic
// tag icon and their trailing path segment as the label.
export const ABSTRACTION_PREFIX = 'data/abstraction/'

export const SCHEMA_META: Record<string, { label: string; icon: LucideIcon }> = {
  'data/abstraction/file': { label: 'Files', icon: FileText },
  'data/abstraction/note': { label: 'Notes', icon: StickyNote },
  'data/abstraction/todo': { label: 'Todos', icon: ListTodo },
  'data/abstraction/tab': { label: 'Tabs', icon: Globe },
  'data/abstraction/email': { label: 'Emails', icon: Mail },
  'data/abstraction/link': { label: 'Links', icon: LinkIcon },
}

export function schemaMeta(key: string): { label: string; icon: LucideIcon } {
  return SCHEMA_META[key] ?? {
    label: key.startsWith(ABSTRACTION_PREFIX)
      ? key.slice(ABSTRACTION_PREFIX.length).replace(/(^|\/)(\w)/g, (_, s, c) => s + c.toUpperCase())
      : key,
    icon: TagIcon,
  }
}

// Icon for a full document schema string (e.g. a document's `.schema`). Used for
// map pins where only the glyph is needed.
export function schemaIcon(schema: string): LucideIcon {
  return SCHEMA_META[schema]?.icon ?? TagIcon
}
