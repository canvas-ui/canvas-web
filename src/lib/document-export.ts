import type { Document } from '../types/workspace.ts'

/** Workspace-local IDs are reassigned on import; retain the complete record payload. */
export function portableDocument(document: Document) {
  const { id: _id, ...record } = document
  return record
}
