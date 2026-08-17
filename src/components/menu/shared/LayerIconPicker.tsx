/**
 * LayerIconPicker — floating popover to set a layer's icon + color.
 * Selections apply live via onChange; the panel stays open so icon and
 * color can be tweaked together (raindrop-style).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import { X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import {
  loadPhosphorFillIcons, searchIcons, LAYER_COLORS, DEFAULT_FOLDER_ICON,
  type LayerStyle,
} from '@/lib/layer-style'

const MAX_RESULTS = 180

interface LayerIconPickerProps {
  x: number
  y: number
  current: LayerStyle
  onChange: (change: LayerStyle) => void
  onClose: () => void
}

export function LayerIconPicker({ x, y, current, onChange, onClose }: LayerIconPickerProps) {
  useEscapeClose(onClose)
  const [query, setQuery] = useState('')
  const [allIcons, setAllIcons] = useState<string[]>([])
  // Results tagged with the query they answer — `searching` and the visible
  // list are derived from whether the stored results match the live query.
  const [resultsFor, setResultsFor] = useState<{ q: string; list: string[] }>({ q: '', list: [] })
  const [loading, setLoading] = useState(true)
  const searchRef = useRef<HTMLInputElement>(null)
  // Manual double-click: Iconify swaps the icon's inner DOM async, which breaks
  // native dblclick (it needs both clicks on the same element).
  const lastClick = useRef<{ name: string; t: number }>({ name: '', t: 0 })

  // `t` comes from the click event's timeStamp so no clock is read here —
  // only the delta between two clicks matters.
  const handleIconClick = (name: string, t: number) => {
    onChange({ icon: name })
    if (lastClick.current.name === name && t - lastClick.current.t < 350) onClose()
    lastClick.current = { name, t }
  }

  useEffect(() => { searchRef.current?.focus() }, [])

  useEffect(() => {
    let active = true
    loadPhosphorFillIcons().then((list) => {
      if (active) { setAllIcons(list); setLoading(false) }
    })
    return () => { active = false }
  }, [])

  // While typing, search the whole Iconify catalog (debounced); otherwise
  // browse the cached Phosphor list.
  useEffect(() => {
    const q = query.trim()
    if (!q) return
    const t = setTimeout(() => {
      searchIcons(q).then((r) => { setResultsFor({ q, list: r }) })
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const trimmedQuery = query.trim()
  const hasResults = resultsFor.q === trimmedQuery
  const searching = trimmedQuery !== '' && !hasResults

  const icons = useMemo(
    () => (trimmedQuery ? (hasResults ? resultsFor.list : []) : allIcons).slice(0, MAX_RESULTS),
    [trimmedQuery, hasResults, resultsFor.list, allIcons],
  )

  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  // Keep the panel inside the viewport. Re-clamp on every size change since the
  // icon grid grows after the catalog loads asynchronously, and on window resize.
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    const margin = 8
    const clamp = () => {
      const { width, height } = el.getBoundingClientRect()
      setPos({
        x: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
        y: Math.max(margin, Math.min(y, window.innerHeight - height - margin)),
      })
    }
    clamp()
    const ro = new ResizeObserver(clamp)
    ro.observe(el)
    window.addEventListener('resize', clamp)
    return () => { ro.disconnect(); window.removeEventListener('resize', clamp) }
  }, [x, y])

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={panelRef}
        className="fixed z-50 w-[270px] max-w-[90vw] rounded-md border bg-popover p-2 shadow-elevation-4"
        style={{ left: pos.x, top: pos.y }}
      >
        <div className="flex items-center justify-between px-1 pb-1.5">
          <span className="text-xs font-medium">Icon &amp; color</span>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Colors */}
        <div className="flex flex-wrap gap-1.5 px-1 pb-2">
          {LAYER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => onChange({ color: c })}
              className={cn(
                'w-5 h-5 rounded-full border transition-transform hover:scale-110',
                current.color === c ? 'ring-2 ring-offset-1 ring-foreground' : 'border-border',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
          <button
            type="button"
            title="No color"
            onClick={() => onChange({ color: undefined })}
            className={cn(
              'w-5 h-5 rounded-full border flex items-center justify-center text-muted-foreground hover:scale-110 transition-transform',
              !current.color && 'ring-2 ring-offset-1 ring-foreground',
            )}
          >
            <X className="w-3 h-3" />
          </button>
          {/* Custom color */}
          <label
            title="Custom color"
            className={cn(
              'relative w-5 h-5 rounded-full border border-border cursor-pointer hover:scale-110 transition-transform overflow-hidden',
              current.color && !LAYER_COLORS.includes(current.color) && 'ring-2 ring-offset-1 ring-foreground',
            )}
            style={{
              background: current.color && !LAYER_COLORS.includes(current.color)
                ? current.color
                : 'conic-gradient(from 0deg, #ef4444, #eab308, #22c55e, #06b6d4, #6366f1, #ec4899, #ef4444)',
            }}
          >
            <input
              type="color"
              // Literal hex required: `<input type="color">` rejects any
              // value that isn't `#rrggbb`, including `var(--…)`.
              value={current.color ?? '#3b82f6'}
              onChange={(e) => onChange({ color: e.target.value })}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        </div>

        {/* Search */}
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons…"
          className="w-full mb-2 rounded-sm border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
        />

        {/* Icon grid */}
        {loading || searching ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> {searching ? 'Searching…' : 'Loading icons…'}
          </div>
        ) : (
        <div className="grid grid-cols-7 gap-0.5 max-h-[200px] overflow-y-auto">
          <button
            type="button"
            title="No icon"
            onClick={() => onChange({ icon: undefined })}
            className={cn(
              'aspect-square flex items-center justify-center rounded-sm hover:bg-accent text-muted-foreground',
              !current.icon && 'bg-accent ring-1 ring-primary',
            )}
          >
            <X className="w-4 h-4" />
          </button>
          {icons.map((name) => (
            <button
              key={name}
              type="button"
              title={name.replace(/^[^:]+:/, '').replace('-fill', '')}
              onClick={(e) => handleIconClick(name, e.timeStamp)}
              className={cn(
                'aspect-square flex items-center justify-center rounded-sm hover:bg-accent',
                current.icon === name && 'bg-accent ring-1 ring-primary',
              )}
            >
              <Icon icon={name} width={18} height={18} color={current.color} />
            </button>
          ))}
        </div>
        )}
        {!loading && !searching && icons.length === 0 && (
          <div className="px-1 py-3 text-center text-[11px] text-muted-foreground">No icons match “{query}”</div>
        )}
      </div>
    </>,
    document.body,
  )
}

export { DEFAULT_FOLDER_ICON }
