import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ObjectPropertiesCard, type ObjectCardTab } from '@/components/object-card/ObjectPropertiesCard'
import { WorkspaceContentGate } from '@/components/workspace/workspace-content-gate'
import { CanvasAddressBar } from '@/components/common/canvas-address-bar'
import { buildWorkspaceUrl } from '@/utils/url-params'
import { Button } from '@/components/ui/button'
import { getWorkspaceDocument, getWorkspaceDocumentByChecksum } from '@/services/workspace'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import { useMenu } from '@/components/shell/use-menu'
import { useWorkspaceIdentity } from '@/hooks/use-workspace-identity'
import type { Document } from '@/types/workspace'

export default function WorkspaceDocumentPage() {
  const { workspaceName } = useParams<{ workspaceName: string }>()
  if (!workspaceName) return <p role="alert" className="p-6">Workspace not specified.</p>
  return <WorkspaceContentGate workspaceName={workspaceName}><WorkspaceDocumentContent /></WorkspaceContentGate>
}

function WorkspaceDocumentContent() {
  const { workspaceName = '', documentId = '', algo = '', checksum = '' } = useParams<{ workspaceName: string; documentId: string; algo: string; checksum: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { goBack, openM1Drawer, openM2Drawer } = useMenu()
  const workspace = useWorkspaceIdentity(workspaceName)
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

  const navigation = { workspace: workspace?.label || workspaceName, workspaceIcon: workspace?.icon, path: '/', tree: 'context',
    document: current?.document ? getDocumentDisplayInfo(current.document).title : `Document ${lookupLabel}`,
    onBack: goBack,
    onBrowseWorkspaces: () => openM1Drawer('workspaces'),
    onBrowseTree: () => openM2Drawer('workspaces', 'detail', workspaceName),
    onNavigatePath: (path: string) => navigate(buildWorkspaceUrl(workspaceName, path, 'context')) }
  const section = location.hash.slice(1)
  const initialTab: ObjectCardTab = ['view', 'location', 'metadata', 'json', 'synapses', 'backends'].includes(section) ? section as ObjectCardTab : 'view'
  return <div className="flex h-full min-h-0 flex-col">
    {!current?.document && <CanvasAddressBar {...navigation} />}
    {current?.document ? <ObjectPropertiesCard key={identity} document={current.document} workspaceId={workspaceName} onChanged={() => setRevision(value => value + 1)} navigation={navigation} initialTab={initialTab}
      onTabChange={tab => navigate(`${location.pathname}${location.search}#${tab}`, { replace: true })}
      tabActions={<Button variant="ghost" disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh</Button>} />
      : loading ? <p role="status" className="p-6 text-sm text-muted-foreground">Loading document…</p>
        : <div role="alert" className="space-y-2 p-6 text-sm">
          <p className="font-medium">{current?.missing ? `Document ${lookupLabel} not found` : 'Unable to load document'}</p>
          {validLookup && <Button variant="outline" onClick={() => setRevision(value => value + 1)}>Retry</Button>}
          <p className="text-muted-foreground">{!validLookup ? 'Document ID must be a positive integer.' : current?.missing ? 'This record is no longer available in this workspace. Subtree exports skip missing records and report their IDs.' : current?.error}</p>
        </div>}
  </div>
}
