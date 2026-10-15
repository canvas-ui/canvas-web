import { lazy, Suspense, useState, type ReactNode } from 'react'
import { Eye, Info, Braces, Share2, Database, MapPin } from 'lucide-react'
import { CanvasAddressBar, type CanvasAddressBarProps } from '@/components/common/canvas-address-bar'
import { TabBar, type TabDef } from '@/components/ui/tabs'
import { usePublicShareCode } from '@/components/renderers/public-share'
import { ViewTab, MetadataTab, JsonTab, SynapsesTab, BackendsTab } from './tabs'
import { readDocGeo } from '@/utils/geo'
import type { Document } from '@/types/workspace'
import { cn } from '@/lib/utils'

const LocationTab = lazy(() => import('./LocationTab'))

export type ObjectCardTab = 'location' | 'view' | 'metadata' | 'json' | 'synapses' | 'backends'

export interface ObjectPropertiesCardProps {
  document: Document
  workspaceId: string
  initialTab?: ObjectCardTab
  // Open the View tab directly in edit mode (editable schemas only).
  initialEdit?: boolean
  onChanged?: (saved?: Document) => void
  className?: string
  // Narrow hosts (side card): icon-only tab bar.
  compact?: boolean
  navigation?: CanvasAddressBarProps
  tabActions?: ReactNode
  onTabChange?: (tab: ObjectCardTab) => void
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
  document, workspaceId, initialTab = 'view', initialEdit = false, onChanged, className = '', compact = false, navigation, tabActions, onTabChange,
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

  const selectTab = (tab: ObjectCardTab) => { setActiveTab(tab); onTabChange?.(tab) }
  const sideHeader = compact && !!tabActions && !navigation
  const tabBar = <div className={cn(sideHeader && 'document-detail-header shrink-0 border-b-[3px] bg-muted')}>
    <div className={cn('flex min-w-0 items-center', sideHeader && 'mx-auto h-[calc(3rem-4px)] w-full max-w-[var(--document-reading-width,100%)] gap-1 pl-2 pr-2 sm:pl-4')}>
      <TabBar tabs={tabs} active={visibleTab} onChange={selectTab} className={cn('min-w-0 flex-1 px-1', sideHeader && 'h-full border-b-0 px-0 max-sm:gap-0 max-sm:[&>button]:px-2.5')} iconOnly={compact} />{tabActions}
    </div>
  </div>

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      {navigation ? <CanvasAddressBar {...navigation} tabs={tabBar} section={visibleTab}
        onDocument={() => selectTab('view')} onSection={() => selectTab('view')}
        onBack={visibleTab === 'view' ? navigation.onBack : () => selectTab('view')} /> : tabBar}
      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto h-full w-full max-w-[var(--document-reading-width,100%)] p-4">
        {visibleTab === 'view' && <ViewTab document={document} workspaceId={workspaceId} initialEdit={initialEdit && !isPublic} onChanged={onChanged} />}
        {visibleTab === 'location' && geo && <Suspense fallback={<p className="text-sm text-muted-foreground">Loading map…</p>}><LocationTab lat={geo.lat} lon={geo.lon} /></Suspense>}
        {visibleTab === 'metadata' && <MetadataTab document={document} workspaceId={workspaceId} />}
        {visibleTab === 'json' && <JsonTab document={document} workspaceId={workspaceId} />}
        {visibleTab === 'synapses' && !isPublic && <SynapsesTab document={document} workspaceId={workspaceId} />}
        {visibleTab === 'backends' && !isPublic && <BackendsTab document={document} workspaceId={workspaceId} onChanged={onChanged} />}
      </div>
      </div>
    </div>
  )
}
