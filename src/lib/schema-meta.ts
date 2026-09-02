import { FileText, StickyNote, ListTodo, Globe, Mail, Link as LinkIcon, User, Brush, Tag as TagIcon, type LucideIcon } from 'lucide-react'

// Friendly label + icon per known document-type (`data/schema/*`) schema.
// Shared by the toolbox Features picker and the map filter (pin icons), so a
// note reads the same everywhere. Unknown abstractions fall back to a generic
// tag icon and their trailing path segment as the label.
export const ABSTRACTION_PREFIX = 'data/schema/'

export const SCHEMA_META: Record<string, { label: string; icon: LucideIcon }> = {
  'data/schema/file': { label: 'Files', icon: FileText },
  'data/schema/note': { label: 'Notes', icon: StickyNote },
  'data/schema/task': { label: 'Todos', icon: ListTodo },
  'data/schema/tab': { label: 'Tabs', icon: Globe },
  'data/schema/message/email': { label: 'Emails', icon: Mail },
  'data/schema/link': { label: 'Links', icon: LinkIcon },
  'data/schema/identity': { label: 'Identities', icon: User },
  'data/schema/drawing': { label: 'Sketches', icon: Brush },
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
