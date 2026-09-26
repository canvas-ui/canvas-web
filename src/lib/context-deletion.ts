export const CONTEXT_DELETED_EVENT = 'contexts:deleted'
export interface ContextDeletion { id: string; ownerId?: string }

/** Context IDs are unique per owner, not across shared contexts. */
export function isDeletedContext(
  context: { id: string; userId?: string; isShared?: boolean; type?: string },
  deletion: ContextDeletion,
): boolean {
  if (context.id !== deletion.id) return false
  return deletion.ownerId !== undefined
    ? context.userId === deletion.ownerId
    : context.isShared !== true && context.type !== 'shared'
}
