import './canvas-navigation.css'
import { Search, X } from 'lucide-react'

// Data-only contracts: these controls work in an address bar, a bound filter
// app, or a host on another device. Routing and persistence belong to the host.
export interface CanvasSearchProps {
  localOnly?: boolean
  queries: string[]
  onSearch: (query: string) => void
  onRemoveQuery?: (index: number) => void
  scope?: 'path' | 'workspace'
  onScopeChange?: (scope: 'path' | 'workspace') => void
}

export function SearchInput({ onSearch, onDraftChange, inputRef, label = 'Search documents', clearOnSubmit = true, showSubmitButton = true }: {
  onSearch: (query: string) => void
  onDraftChange?: (query: string) => void
  inputRef?: React.RefObject<HTMLInputElement | null>
  label?: string
  clearOnSubmit?: boolean
  showSubmitButton?: boolean
}) {
  return <form className="canvas-search-input" role="search" onSubmit={event => {
    event.preventDefault()
    const input = event.currentTarget.elements.namedItem('query') as HTMLInputElement
    const query = input.value.trim()
    if (!query) return
    onSearch(query)
    if (clearOnSubmit) {
      input.value = ''
      onDraftChange?.('')
    }
  }}>
    {/* The DOM owns the buffer so Android IME composition is never rewritten. */}
    <input ref={inputRef} name="query" type="search" aria-label={label} placeholder={label}
      autoComplete="off" enterKeyHint="search" onChange={event => onDraftChange?.(event.target.value)}
      onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault() }} />
    {showSubmitButton && <button type="submit" className="canvas-nav-button" aria-label="Run search" title="Run search"><Search size={17} /></button>}
  </form>
}

export function SearchOptions({ queries, onRemoveQuery, scope = 'path', onScopeChange }: Omit<CanvasSearchProps, 'onSearch'>) {
  return <div className="canvas-search-options">
    {onScopeChange && <div className="canvas-search-scopes" aria-label="Search scope">
      <span>Search in</span>
      <button type="button" aria-pressed={scope === 'path'} onClick={() => onScopeChange('path')}>This path</button>
      <button type="button" aria-pressed={scope === 'workspace'} onClick={() => onScopeChange('workspace')}>Workspace</button>
    </div>}
    {queries.length > 0 && <div className="canvas-search-queries" aria-label="Active searches">
      {queries.map((query, index) => <span className="canvas-search-query" key={`${query}-${index}`}>
        <Search size={12} aria-hidden="true" /><span title={query}>{query}</span>
        {onRemoveQuery && <button type="button" onClick={() => onRemoveQuery(index)} aria-label={`Remove search: ${query}`}><X size={14} /></button>}
      </span>)}
      {onRemoveQuery && queries.length > 1 && <button type="button" onClick={() => onRemoveQuery(-1)} className="canvas-search-clear">Clear all</button>}
    </div>}
  </div>
}
