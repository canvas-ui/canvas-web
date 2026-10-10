import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ObjectPropertiesCard } from '@/components/object-card/ObjectPropertiesCard'
import { WorkspaceContentGate } from '@/components/workspace/workspace-content-gate'
import { Button } from '@/components/ui/button'
import { getWorkspaceDocument, getWorkspaceDocumentByChecksum } from '@/services/workspace'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import type { Document } from '@/types/workspace'

export default function WorkspaceDocumentPage() {
  const { workspaceName } = useParams<{ workspaceName: string }>()
  if (!workspaceName) return <p role="alert" className="p-6">Workspace not specified.</p>
  return <WorkspaceContentGate workspaceName={workspaceName}><WorkspaceDocumentContent /></WorkspaceContentGate>
}

function WorkspaceDocumentContent() {
  const { workspaceName = '', documentId = '', algo = '', checksum = '' } = useParams<{ workspaceName: string; documentId: string; algo: string; checksum: string }>()
  const byChecksum = !!algo && !!checksum
  const lookupLabel = byChecksum ? `${algo}/${checksum}` : documentId
  const identity = JSON.stringify([workspaceName, documentId, algo, checksum])
  const id = Number(documentId)
  const validId = /^\d+$/.test(documentId) && Number.isSafeInteger(id) && id > 0
  const validLookup = byChecksum || validId
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{
    identity: string; revision: number; document: Document | null; missing: boolean; error: string
  } | null>(null)
  const current = result?.identity === identity ? result : null
  const loading = validLookup && (!current || current.revision !== revision)

  useEffect(() => {
    let cancelled = false
    if (!validLookup) return
    const request = byChecksum ? getWorkspaceDocumentByChecksum(workspaceName, algo, checksum) : getWorkspaceDocument(workspaceName, id)
    request.then(document => {
      if (cancelled) return
      setResult({ identity, revision, document: document || null, missing: !document, error: '' })
    }).catch(error => {
      if (cancelled) return
      setResult({ identity, revision, document: null, missing: error?.statusCode === 404,
        error: error instanceof Error ? error.message : 'Unable to retrieve this document.' })
    })
    return () => { cancelled = true }
  }, [workspaceName, id, identity, revision, validLookup, byChecksum, algo, checksum])

  return <div className="flex h-full min-h-0 flex-col">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b p-4">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold">{current?.document ? getDocumentDisplayInfo(current.document).title : `Document ${lookupLabel}`}</h1>
        <p className="break-all text-xs text-muted-foreground">Workspace: {workspaceName} · {byChecksum ? `Checksum: ${lookupLabel}` : `ID: ${documentId}`}{current?.document && ` · ${byChecksum ? `ID: ${current.document.id} · ` : ''}${current.document.schema}`}</p>
      </div>
      <div className="flex items-center gap-3">
        <Link className="text-sm underline" to={`/workspaces/${encodeURIComponent(workspaceName)}`}>Workspace</Link>
        <Button variant="outline" disabled={!validLookup || loading} onClick={() => setRevision(value => value + 1)}>Refresh</Button>
      </div>
    </header>
    {current?.document ? <ObjectPropertiesCard key={identity} document={current.document} workspaceId={workspaceName} onChanged={() => setRevision(value => value + 1)} />
      : loading ? <p role="status" className="p-6 text-sm text-muted-foreground">Loading document…</p>
        : <div role="alert" className="space-y-2 p-6 text-sm">
          <p className="font-medium">{current?.missing ? `Document ${lookupLabel} not found` : 'Unable to load document'}</p>
          <p className="text-muted-foreground">{!validLookup ? 'Document ID must be a positive integer.' : current?.missing ? 'This record is no longer available in this workspace. Subtree exports skip missing records and report their IDs.' : current?.error}</p>
        </div>}
  </div>
}
