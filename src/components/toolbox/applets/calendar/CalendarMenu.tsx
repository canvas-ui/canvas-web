import type { ReactNode } from 'react'
import { CalendarPlus, CheckCircle2, Circle, ExternalLink, Eye, Sun, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ContextMenuShell } from '@/components/common/context-menu-shell'
import { formatDayShort, formatTime } from '@/lib/calendar/dates'
import type { Occurrence } from '@/lib/calendar/occurrences'

// The calendar's own right-click menu: on an entry (open, document page,
// done toggle, delete) or on an empty slot (new event there, new all-day
// event, open the day).
export type CalendarMenuState =
  | { x: number; y: number; kind: 'entry'; occurrence: Occurrence }
  | { x: number; y: number; kind: 'slot'; start: Date; allDay: boolean }

export interface CalendarMenuHandlers {
  onEntryMenu: (e: React.MouseEvent, o: Occurrence) => void
  onSlotMenu: (e: React.MouseEvent, start: Date, allDay: boolean) => void
}

export function CalendarMenu({ menu, onClose, onOpen, onOpenDocument, onToggleDone, onDelete, onCreate, onPickDay }: {
  menu: CalendarMenuState
  onClose: () => void
  onOpen: (o: Occurrence) => void
  onOpenDocument: ((o: Occurrence) => void) | null
  onToggleDone: (o: Occurrence) => void
  onDelete: (o: Occurrence) => void
  onCreate: (start: Date, allDay: boolean) => void
  onPickDay: (day: Date) => void
}) {
  const run = (fn: () => void) => () => { onClose(); fn() }
  return (
    <ContextMenuShell x={menu.x} y={menu.y} onClose={onClose} className="min-w-44 rounded-md border bg-popover p-1 text-xs shadow-elevation-3">
      {menu.kind === 'entry' ? (
        <>
          <p className="truncate px-3 py-1.5 text-[11px] text-muted-foreground" title={menu.occurrence.title}>{menu.occurrence.title}</p>
          <Item icon={<Eye className="h-3.5 w-3.5" />} onClick={run(() => onOpen(menu.occurrence))}>Open</Item>
          {onOpenDocument && <Item icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={run(() => onOpenDocument(menu.occurrence))}>Open document</Item>}
          {menu.occurrence.kind === 'task' && (
            <Item icon={menu.occurrence.done ? <Circle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />} onClick={run(() => onToggleDone(menu.occurrence))}>
              {menu.occurrence.done ? 'Mark as pending' : 'Mark as completed'}
            </Item>
          )}
          {menu.occurrence.kind === 'event' && (
            <Item icon={<Trash2 className="h-3.5 w-3.5" />} className="text-destructive" onClick={run(() => onDelete(menu.occurrence))}>Delete…</Item>
          )}
        </>
      ) : (
        <>
          <p className="px-3 py-1.5 text-[11px] text-muted-foreground">{formatDayShort(menu.start)}{menu.allDay ? '' : `, ${formatTime(menu.start)}`}</p>
          <Item icon={<CalendarPlus className="h-3.5 w-3.5" />} onClick={run(() => onCreate(menu.start, menu.allDay))}>
            {menu.allDay ? 'New event' : `New event at ${formatTime(menu.start)}`}
          </Item>
          {!menu.allDay && <Item icon={<Sun className="h-3.5 w-3.5" />} onClick={run(() => onCreate(menu.start, true))}>New all-day event</Item>}
          <Item icon={<Eye className="h-3.5 w-3.5" />} onClick={run(() => onPickDay(menu.start))}>Open day</Item>
        </>
      )}
    </ContextMenuShell>
  )
}

function Item({ icon, onClick, className, children }: { icon: ReactNode; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex w-full items-center gap-2 rounded px-3 py-1.5 text-left hover:bg-accent', className)}>
      <span className="text-muted-foreground">{icon}</span>{children}
    </button>
  )
}
