import { lazy, Suspense, useState } from 'react'
import { Eye, Info, Braces, Share2, Database, MapPin } from 'lucide-react'
import { TabBar, type TabDef } from '@/components/ui/tabs'
import { usePublicShareCode } from '@/components/renderers/public-share'
import { ViewTab, MetadataTab, JsonTab, SynapsesTab, BackendsTab } from './tabs'
import { readDocGeo } from '@/utils/geo'
import type { Document } from '@/types/workspace'

const LocationTab = lazy(() => import('./LocationTab'))

export type ObjectCardTab = 'location' | 'view' | 'metadata' | 'json' | 'synapses' | 'backends'

export interface ObjectPropertiesCardProps {
  document: Document
  workspaceId: string
  initialTab?: ObjectCardTab
  // Open the View tab directly in edit mode (editable schemas only).
  initialEdit?: boolean
  onChanged?: () => void
  className?: string
  // Narrow hosts (side card): icon-only tab bar.
  compact?: boolean
}

const TABS: TabDef<ObjectCardTab>[] = [
  { id: 'view', label: 'View', icon: Eye },
  { id: 'location', label: 'Location', icon: MapPin },
  { id: 'metadata', label: 'Metadata', icon: Info },
  { id: 'json', label: 'JSON', icon: Braces },
  { id: 'synapses', label: 'Synapses', icon: Share2 },
  { id: 'backends', label: 'Backends', icon: Database },
]

// Unified tabbed object properties card — the ONE detail surface for any
// document. Chrome-less: hosts (side card, modal) provide their own frame.
export function ObjectPropertiesCard({
  document, workspaceId, initialTab = 'view', initialEdit = false, onChanged, className = '', compact = false,
}: ObjectPropertiesCardProps) {
  // Public share viewer: no authenticated APIs — hide Synapses/Backends + edit.
  const isPublic = usePublicShareCode() != null
  const geo = readDocGeo(document)
  const tabs = TABS.filter(t => (t.id !== 'location' || geo !== null)
    && (!isPublic || !['synapses', 'backends'].includes(t.id)))
  const [activeTab, setActiveTab] = useState<ObjectCardTab>(initialTab)
  // Render-time state reset (not an effect): switching documents or the
  // requested initial tab re-seeds the active tab.
  const resetKey = `${document.id}:${initialTab}`
  const [lastResetKey, setLastResetKey] = useState(resetKey)
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey)
    setActiveTab(initialTab)
  }

  const visibleTab = tabs.some(tab => tab.id === activeTab) ? activeTab : 'view'

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      <TabBar tabs={tabs} active={visibleTab} onChange={setActiveTab} className="shrink-0 px-2" iconOnly={compact} />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {visibleTab === 'view' && <ViewTab document={document} workspaceId={workspaceId} initialEdit={initialEdit && !isPublic} onChanged={onChanged} />}
        {visibleTab === 'location' && geo && <Suspense fallback={<p className="text-sm text-muted-foreground">Loading map…</p>}><LocationTab lat={geo.lat} lon={geo.lon} /></Suspense>}
        {visibleTab === 'metadata' && <MetadataTab document={document} workspaceId={workspaceId} />}
        {visibleTab === 'json' && <JsonTab document={document} workspaceId={workspaceId} />}
        {visibleTab === 'synapses' && !isPublic && <SynapsesTab document={document} workspaceId={workspaceId} />}
        {visibleTab === 'backends' && !isPublic && <BackendsTab document={document} workspaceId={workspaceId} onChanged={onChanged} />}
      </div>
    </div>
  )
}
