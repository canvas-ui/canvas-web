import type { HookRuleAction, PendingAction } from '../services/hooks'

function resolvedFolder(action: HookRuleAction, match: PendingAction['pathMatch']): string | null {
  if (!['download', 'store'].includes(action.action)) return null
  if (action.recursive === true && !match) return null
  const folder = String(action.folder || '')
  if (folder.includes('{{')) return null
  const relative = action.recursive === true ? action.pathMode === 'full' ? match?.path : match?.rel : ''
  return [folder, relative || ''].join('/').split('/').filter(part => part && part !== '.' && part !== '..').join('/')
}

/** Show the backend folder resolved from the proposal's original filing event. */
export function pendingActionDestination(action: HookRuleAction, match: PendingAction['pathMatch']): string | null {
  if (!['download', 'store'].includes(action.action) || typeof action.to !== 'string') return null
  if (action.recursive === true && !match) return 'Missing filing path — decline and trigger the rule again'
  const folder = resolvedFolder(action, match)
  return folder === null ? null : `${action.to}/${folder}`
}

/** Display concrete folders without leaving instructions to append the path again.
 * These objects are for review only; approval submits the saved action and edits.
 */
export function pendingActionPreview(action: HookRuleAction, match: PendingAction['pathMatch']): HookRuleAction {
  const folder = resolvedFolder(action, match)
  if (folder === null || action.recursive !== true || action.autoLink === true) return { ...action }
  const preview: HookRuleAction = { ...action, folder }
  delete preview.recursive
  delete preview.pathMode
  return preview
}

export function pendingActionsForReview(item: PendingAction, amendments: Record<string, unknown>): HookRuleAction[] {
  const copy = structuredClone({ actions: item.actions })
  for (const [key, value] of Object.entries(amendments)) {
    if (!item.editable.includes(key)) continue
    const parts = key.split('.')
    if (parts[0] !== 'actions' || parts.some(part => ['__proto__', 'prototype', 'constructor'].includes(part))) continue
    let target: Record<string, unknown> = copy
    for (const part of parts.slice(0, -1)) {
      if (!target[part] || typeof target[part] !== 'object') { target = {}; break }
      target = target[part] as Record<string, unknown>
    }
    target[parts[parts.length - 1]] = value
  }
  return copy.actions
}
