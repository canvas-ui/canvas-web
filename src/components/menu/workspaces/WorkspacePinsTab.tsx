/**
 * WorkspacePinsTab — the M2 "Pins" tab: the workspace's pinned tree paths
 * (task containers) as prominent tiles. Title = folder label, subtitle = the
 * full tree path; the layer's own color and icon are shown when present.
 * Tiles are drag-sortable; the order is the workspace's (server-persisted).
 */
import { useState } from 'react'
import { Icon } from '@iconify/react'
import { GripVertical, PinOff, Lock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEFAULT_FOLDER_ICON, DEFAULT_CANVAS_ICON } from '@/lib/layer-style'
import { visibleAccentColor } from '@/utils/color'
import { workspacePinKey as pinKey, type WorkspacePin } from '@/services/workspace'

interface WorkspacePinsTabProps {
  pins: WorkspacePin[]
  isLoading: boolean
  searchQuery?: string
  activeKey?: string | null
  onOpen: (pin: WorkspacePin) => void
  onUnpin: (pin: WorkspacePin) => Promise<void>
  /** Move pin `id` before `beforeId` (null = to the end). */
  onMove: (id: string, beforeId: string | null) => Promise<void>
}

const PIN_DRAG_TYPE = 'application/x-canvas-workspace-pin'

export function WorkspacePinsTab({ pins, isLoading, searchQuery = '', activeKey, onOpen, onUnpin, onMove }: WorkspacePinsTabProps) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string | null; before: boolean } | null>(null)

  const q = searchQuery.toLowerCase().trim()
  const visible = q
    ? pins.filter(p =>
      (p.label || p.name || '').toLowerCase().includes(q)
      || p.path.toLowerCase().includes(q)
      || (p.description || '').toLowerCase().includes(q))
    : pins

  const endDrag = () => { setDragId(null); setDropTarget(null) }

  const handleDrop = async () => {
    const target = dropTarget
    const id = dragId
    endDrag()
    if (!id || !target || target.id === id) return
    // "after X" == "before the pin following X" (null = end).
    let beforeId: string | null = target.id
    if (target.id && !target.before) {
      const idx = pins.findIndex(p => p.id === target.id)
      beforeId = pins[idx + 1]?.id ?? null
    }
    if (beforeId === id) return
    try { await onMove(id, beforeId) } catch (err) { alert(err instanceof Error ? err.message : String(err)) }
  }

  if (isLoading && !pins.length) return <div className="px-3 py-3 text-xs text-muted-foreground">Loading pins…</div>
  if (!pins.length) {
    return (
      <div className="px-3 py-6 text-xs text-muted-foreground text-center space-y-1">
        <p>No pinned folders yet.</p>
        <p className="text-muted-foreground/70">Right-click a folder in the context or directory tree and choose <span className="font-medium">Pin</span>.</p>
      </div>
    )
  }
  if (!visible.length) return <div className="px-3 py-3 text-xs text-muted-foreground">No pins match “{searchQuery}”</div>

  return (
    <div
      className="p-2 flex flex-col gap-2"
      // Dropping on the padding below the last tile appends.
      onDragOver={e => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
      onDrop={e => { e.preventDefault(); if (dragId && !dropTarget) setDropTarget({ id: null, before: false }); void handleDrop() }}
    >
      {visible.map(pin => {
        const unresolved = pin.resolvable === false
        const accent = visibleAccentColor(pin.color)
        const icon = pin.icon || (pin.type === 'canvas' ? DEFAULT_CANVAS_ICON : DEFAULT_FOLDER_ICON)
        const isActive = activeKey === pinKey(pin.tree, pin.path)
        const isDropBefore = dropTarget?.id === pin.id && dropTarget.before
        const isDropAfter = dropTarget?.id === pin.id && !dropTarget.before
        return (
          <div
            key={pin.id}
            role="button"
            tabIndex={0}
            draggable={!q}
            onDragStart={e => {
              e.dataTransfer.setData(PIN_DRAG_TYPE, pin.id)
              e.dataTransfer.setData('text/plain', pin.path)
              e.dataTransfer.effectAllowed = 'move'
              setDragId(pin.id)
            }}
            onDragEnd={endDrag}
            onDragOver={e => {
              if (!dragId || dragId === pin.id) return
              e.preventDefault()
              e.stopPropagation()
              e.dataTransfer.dropEffect = 'move'
              const rect = e.currentTarget.getBoundingClientRect()
              const before = e.clientY < rect.top + rect.height / 2
              setDropTarget(prev => (prev?.id === pin.id && prev.before === before ? prev : { id: pin.id, before }))
            }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); void handleDrop() }}
            onClick={() => { if (!unresolved) onOpen(pin) }}
            onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !unresolved) { e.preventDefault(); onOpen(pin) } }}
            title={unresolved ? `${pin.path} — folder no longer exists` : `Open ${pin.tree}:${pin.path}`}
            className={cn(
              'group relative flex items-stretch gap-2.5 rounded-lg border bg-card shadow-elevation-1 text-left transition-colors',
              unresolved ? 'opacity-70 cursor-default' : 'cursor-pointer hover:bg-accent/40',
              isActive && 'ring-1 ring-primary/60',
              dragId === pin.id && 'opacity-40',
              isDropBefore && 'border-t-2 border-t-primary',
              isDropAfter && 'border-b-2 border-b-primary',
            )}
            style={{ borderLeft: `5px solid ${accent ?? 'transparent'}` }}
          >
            {/* Icon well — tinted with the layer color when it has one. */}
            <div
              className="flex items-center justify-center w-12 shrink-0 rounded-l-[5px] my-0 self-stretch"
              style={accent ? { backgroundColor: `${accent}22` } : undefined}
            >
              {unresolved
                ? <AlertTriangle className="w-5 h-5 text-warning" />
                : <Icon icon={icon} width={22} height={22} color={accent} className={cn(!accent && (pin.type === 'canvas' ? 'text-primary' : 'text-muted-foreground'))} />}
            </div>

            <div className="flex flex-col min-w-0 flex-1 py-2 pr-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm font-semibold leading-tight truncate">{pin.label || pin.name || pin.path.split('/').pop()}</span>
                {pin.locked && <Lock className="w-3 h-3 shrink-0 text-warning" />}
              </div>
              <span className="text-[11px] text-muted-foreground truncate leading-tight font-mono mt-0.5">
                {pin.tree}:{pin.path}
              </span>
              {pin.description && (
                <span className="text-[11px] text-muted-foreground/80 truncate leading-tight mt-1">{pin.description}</span>
              )}
              {unresolved && (
                <span className="text-[11px] text-warning leading-tight mt-1">Folder no longer exists</span>
              )}
            </div>

            <div className="flex flex-col items-center justify-between py-1.5 pr-1.5 shrink-0">
              <button
                type="button"
                onClick={async e => {
                  e.stopPropagation()
                  try { await onUnpin(pin) } catch (err) { alert(err instanceof Error ? err.message : String(err)) }
                }}
                title="Unpin"
                aria-label="Unpin"
                className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground reveal-on-hover hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <PinOff className="w-3.5 h-3.5" />
              </button>
              {!q && <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 cursor-grab active:cursor-grabbing" aria-hidden />}
            </div>
          </div>
        )
      })}
    </div>
  )
}
