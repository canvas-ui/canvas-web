import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { Document } from '@/types/workspace'
import { getWorkspace, getWorkspaceDocument } from '@/services/workspace'
import { canManageWorkspace } from '@/lib/workspace-access'
import { documentRulePresets } from '@/lib/document-rule'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import { DocumentActionDialog } from '@/components/common/document-action-dialog'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { RuleBuilder } from './rule-builder'

export function DocumentRuleDialog({ workspaceId, document, onClose }: {
  workspaceId: string; document: Document; onClose: () => void
}) {
  const [source, setSource] = useState<Document | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState('')
  useEscapeClose(onClose)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const workspace = await getWorkspace(workspaceId)
      if (!canManageWorkspace(workspace)) throw new Error('Only workspace administrators can create rules.')
      // List results may contain only a body preview. Build from the full item.
      const full = await getWorkspaceDocument(workspaceId, document.id)
      if (!cancelled) setSource(full)
    })().catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load document') })
    return () => { cancelled = true }
  }, [workspaceId, document.id])
  const presets = useMemo(() => source ? documentRulePresets(source) : [], [source])
  const preset = presets.find(item => item.id === selected) || presets[0]
  const prefill = useMemo(() => preset ? { kind: 'document' as const, rule: preset.rule } : null, [preset])
  return (
    <DocumentActionDialog label="Create rule" onClose={onClose}>
      <div className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="document-rule-title" className="text-lg font-semibold">Create rule</h2>
            <p className="truncate text-sm text-muted-foreground">{getDocumentDisplayInfo(document).title}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-md p-2 hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : !source ? <p className="text-sm text-muted-foreground">Loading document…</p> : <>
          <label className="mb-4 block space-y-2 text-sm font-medium">
            <span>Start with</span>
            <select className="h-10 w-full rounded-md border bg-background px-3" value={preset?.id} onChange={e => setSelected(e.target.value)}>
              {presets.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <RuleBuilder workspaceId={workspaceId} prefill={prefill} createOnly onCreated={onClose} onCancel={onClose} />
        </>}
      </div>
    </DocumentActionDialog>
  )
}
