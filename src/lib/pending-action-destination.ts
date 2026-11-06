import type { HookRuleAction, PendingAction } from '../services/hooks'

/** Show the backend folder resolved from the proposal's original filing event. */
export function pendingActionDestination(action: HookRuleAction, match: PendingAction['pathMatch']): string | null {
  if (!['download', 'store'].includes(action.action) || typeof action.to !== 'string') return null
  if (action.recursive === true && !match) return 'Missing filing path — decline and trigger the rule again'
  const folder = String(action.folder || '')
  if (folder.includes('{{')) return null
  const relative = action.recursive === true ? action.pathMode === 'full' ? match?.path : match?.rel : ''
  const key = [folder, relative || ''].join('/').split('/').filter(part => part && part !== '.' && part !== '..').join('/')
  return `${action.to}/${key}`
}
