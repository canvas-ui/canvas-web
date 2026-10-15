import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Search, SlidersHorizontal, Plus, X } from 'lucide-react'
import { Icon } from '@iconify/react'
import { DEFAULT_WORKSPACE_ICON } from '@/lib/layer-style'
import { treeBreadcrumbs } from '@/lib/tree-breadcrumbs'
import { SearchInput, SearchOptions, type CanvasSearchProps } from './canvas-search'
import './canvas-navigation.css'

export function CanvasTabStrip({ children, accentColor }: { children: ReactNode; accentColor?: string | null }) {
  return <div className="canvas-navigation-tabs">
    <span aria-hidden="true" className="canvas-tab-divider" style={accentColor ? { backgroundColor: accentColor } : undefined} />
    {children}
  </div>
}

export interface CanvasAddressBarProps {
  workspace: string
  workspaceIcon?: string | null
  tree?: string
  path: string
  document?: string
  section?: string
  onBack?: () => void
  onBrowseWorkspaces?: () => void
  onBrowseTree?: () => void
  onNavigatePath?: (path: string) => void
  onDocument?: () => void
  onSection?: () => void
  onFilter?: () => void
  filtersActive?: boolean
  filtersOpen?: boolean
  onAdd?: (event: React.MouseEvent<HTMLButtonElement>) => void
  search?: CanvasSearchProps
  onDraftChange?: (value: string) => void
  tabs?: ReactNode
  accentColor?: string | null
  actions?: ReactNode
}

export function CanvasAddressBar({ workspace, workspaceIcon, tree, path, document: documentTitle, section, onBack, onBrowseWorkspaces, onBrowseTree, onNavigatePath, onDocument, onSection, onFilter, filtersActive, filtersOpen, onAdd, search, onDraftChange, tabs, accentColor, actions }: CanvasAddressBarProps) {
  const [searching, setSearching] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const addressRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchButtonRef = useRef<HTMLButtonElement>(null)
  const restoreSearchFocus = useRef(false)
  const identity = JSON.stringify([workspace, tree, path, documentTitle])
  const [previousIdentity, setPreviousIdentity] = useState(identity)
  if (previousIdentity !== identity) { setPreviousIdentity(identity); setSearching(false) }
  useEffect(() => {
    if (searching) inputRef.current?.focus()
    else {
      if (addressRef.current) { addressRef.current.scrollLeft = addressRef.current.scrollWidth; setScrolled(addressRef.current.scrollLeft > 1) }
      if (restoreSearchFocus.current) { searchButtonRef.current?.focus(); restoreSearchFocus.current = false }
    }
  }, [searching, identity, section])
  const closeSearch = () => { restoreSearchFocus.current = true; setSearching(false); onDraftChange?.('') }
  const back = searching ? closeSearch : onBack ?? onBrowseTree
  const items = treeBreadcrumbs(path, workspace).slice(1)
  const crumb = (label: ReactNode, className: string, action?: () => void, title?: string, current = false) => action
    ? <button type="button" className={className} onClick={action} title={title} aria-current={current ? 'location' : undefined}>{label}</button>
    : <span className={`canvas-address-label ${className}`} title={title} aria-current={current ? 'location' : undefined}>{label}</span>

  return <header className={`canvas-navigation${tabs ? ' has-tabs' : ''}`} style={accentColor ? { borderTopColor: accentColor } : undefined}>
    {tabs && <CanvasTabStrip accentColor={accentColor}>{tabs}</CanvasTabStrip>}
    <div className="canvas-address-row">
      <button type="button" className="canvas-nav-button" aria-label={searching ? 'Back to address' : 'Back to previous view'} title={searching ? 'Back to address' : 'Back to previous view'} disabled={!searching && !onBack && !onBrowseTree} onClick={back}><ArrowLeft size={19} /></button>
      <div className="canvas-address-field" onDoubleClick={event => {
        if (search && !(event.target as HTMLElement).closest('button')) setSearching(true)
      }} onKeyDown={event => { if (event.key === 'Escape' && searching) { event.preventDefault(); event.stopPropagation(); closeSearch() } }}>
        {searching && search ? <SearchInput inputRef={inputRef} onSearch={search.onSearch} onDraftChange={onDraftChange} clearOnSubmit={!search.localOnly} label={search.queries.length ? 'Refine search…' : 'Search documents…'} /> : <>
            {crumb(<><Icon icon={workspaceIcon || DEFAULT_WORKSPACE_ICON} className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{workspace}</span></>, 'canvas-address-workspace', onBrowseWorkspaces, 'Browse workspaces')}
          <div ref={addressRef} className={`canvas-address-crumbs${scrolled ? " is-scrolled" : ""}`} onScroll={event => setScrolled(event.currentTarget.scrollLeft > 1)} role="navigation" aria-label="Canvas address" tabIndex={0}
            onKeyDown={event => { if (event.key === 'Enter' && event.target === event.currentTarget && search) setSearching(true) }}>
            {tree && crumb(`[${tree}]`, 'canvas-address-tree', onBrowseTree, `Browse tree: ${tree}`)}
            {crumb(':/', 'canvas-address-root', onNavigatePath ? () => onNavigatePath('/') : undefined, 'Go to tree root')}
            {items.map((item, index) => <span className="canvas-address-segment" key={item.path}>
              {index > 0 && <span aria-hidden="true">/</span>}
              {crumb(item.label, '', onNavigatePath ? () => onNavigatePath(item.path) : undefined, item.path, !documentTitle && index === items.length - 1)}
            </span>)}
            {documentTitle && <span className="canvas-address-segment"><span aria-hidden="true">{items.length ? '/' : ''}</span>{crumb(documentTitle, '', onDocument, documentTitle)}</span>}
            {section && crumb(`#${section}`, 'canvas-address-section', onSection, section, true)}
          </div>
          {search && <button ref={searchButtonRef} type="button" className="canvas-nav-button canvas-address-search" onClick={() => setSearching(true)} aria-label="Search this canvas" aria-expanded={false} title="Search this canvas">
            <Search size={17} />{search.queries.length > 0 && <span className="canvas-nav-dot" />}
          </button>}
        </>}
      </div>
      {onFilter && <button type="button" className="canvas-nav-button canvas-filter-button" onClick={onFilter} aria-label={filtersActive ? 'Filters active' : 'Filters'} aria-expanded={!!filtersOpen} data-active={!!filtersActive} title={filtersActive ? 'Filters active' : 'Filters'}><SlidersHorizontal size={19} />{filtersActive && <span className="canvas-nav-dot" />}</button>}
      {onAdd && <button type="button" className="canvas-nav-button canvas-add-button" onClick={onAdd} aria-label="Add here" title="Add here"><Plus size={21} /></button>}
      {actions}
    </div>
    {searching && search && <div className="canvas-search-dropdown">
      <div className="canvas-search-heading"><span>{search.localOnly ? 'Filter documents on this page' : onDraftChange ? 'Type to filter this page · Enter to search all results' : 'Search text or an exact ID, e.g. @id:123'}</span><button type="button" className="canvas-nav-button" onClick={closeSearch} aria-label="Close search"><X size={16} /></button></div>
      <SearchOptions {...search} />
    </div>}
    {!searching && search && search.queries.length > 0 && <div className="px-3 pb-2"><SearchOptions queries={search.queries} onRemoveQuery={search.onRemoveQuery} /></div>}
  </header>
}
