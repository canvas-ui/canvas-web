/**
 * DateTimePicker — calendar + time-slot popover on Outlook granularity
 * (15-minute windows), replacing the native <input type="datetime-local">.
 *
 * The value is a LOCAL wall-clock string in the same `YYYY-MM-DDTHH:mm` shape
 * the native control used, so every call site (todo add/edit/applet) keeps
 * working with the existing isoToLocalInput / localInputToISO converters and
 * no timezone handling moves.
 *
 * An off-grid value (e.g. the 23:59 "end of day" default) is never rewritten:
 * it is spliced into the slot list in sorted position and shown as selected,
 * so opening the picker cannot silently shift a due date.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Outlook-style granularity.
const MINUTE_STEP = 15

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function pad(n: number): string { return String(n).padStart(2, '0') }

/**
 * Parse the value string by hand rather than via `new Date(value)`: the parts
 * are wall-clock, and a Date round-trip would drag the local offset in and
 * shift the day across a DST boundary.
 */
function parseLocalValue(value: string): { date: string; time: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || '')
  return m ? { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` } : null
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Now, rounded UP to the next 15-minute slot — the time a bare day pick gets. */
function nextSlotTime(): string {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(Math.ceil(d.getMinutes() / MINUTE_STEP) * MINUTE_STEP)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 00:00 … 23:45 in MINUTE_STEP increments. */
function slotList(): string[] {
  const out: string[] = []
  for (let m = 0; m < 24 * 60; m += MINUTE_STEP) out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`)
  return out
}
const SLOTS = slotList()

/** Monday-first 6x7 grid covering `month`, with leading/trailing spill days. */
function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7 // Sun=0 → Mon-first
  const start = new Date(first)
  start.setDate(first.getDate() - offset)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

function formatTimeLabel(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(2000, 0, 1, h, m)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** Trigger label — "Tue, 12 Aug 2026, 14:30", or the placeholder when unset. */
function formatDateTimeLabel(value: string): string {
  const parts = parseLocalValue(value)
  if (!parts) return ''
  const [y, mo, da] = parts.date.split('-').map(Number)
  const [h, mi] = parts.time.split(':').map(Number)
  return new Date(y, mo - 1, da, h, mi).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

interface DateTimePickerProps {
  /** `YYYY-MM-DDTHH:mm` local wall clock, or '' for unset. */
  value: string
  onChange: (value: string) => void
  id?: string
  placeholder?: string
  /** Render a "Clear" action and allow onChange(''). */
  clearable?: boolean
  disabled?: boolean
  /** Compact trigger for dense surfaces (applet rows). */
  compact?: boolean
  className?: string
}

export function DateTimePicker({
  value, onChange, id, placeholder = 'Pick a date & time',
  clearable = true, disabled = false, compact = false, className = '',
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const parts = parseLocalValue(value)
  const label = parts ? formatDateTimeLabel(value) : ''

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'inline-flex w-full items-center gap-2 rounded-md border border-input bg-transparent text-left shadow-elevation-1 transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          compact ? 'h-6 px-1.5 text-[11px]' : 'h-9 px-3 py-1 text-sm',
          !parts && 'text-muted-foreground',
          className,
        )}
      >
        <CalendarClock className={cn('shrink-0 text-muted-foreground', compact ? 'h-3 w-3' : 'h-4 w-4')} />
        <span className="min-w-0 flex-1 truncate">{label || placeholder}</span>
        {clearable && parts && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear date"
            title="Clear"
            onClick={(e) => { e.stopPropagation(); onChange('') }}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className={compact ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} />
          </span>
        )}
      </button>
      {open && (
        <PickerPanel
          anchorRef={triggerRef}
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function PickerPanel({
  anchorRef, value, onChange, onClose,
}: {
  anchorRef: RefObject<HTMLElement | null>
  value: string
  onChange: (v: string) => void
  onClose: () => void
}) {
  const parts = parseLocalValue(value)
  const selectedDate = parts?.date ?? dateKey(new Date())
  const selectedTime = parts?.time ?? null

  const [month, setMonth] = useState(() => {
    const d = dateFromKey(selectedDate)
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const panelRef = useRef<HTMLDivElement>(null)
  const timeListRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  // Anchor below the trigger, flipped/clamped to stay in the viewport.
  useLayoutEffect(() => {
    const el = panelRef.current
    const anchor = anchorRef.current
    if (!el || !anchor) return
    const margin = 8
    const place = () => {
      const rect = anchor.getBoundingClientRect()
      const { width, height } = el.getBoundingClientRect()
      const below = rect.bottom + 4
      const y = below + height + margin > window.innerHeight
        ? Math.max(margin, rect.top - height - 4)
        : below
      const x = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))
      setPos({ x, y })
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchorRef])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Off-grid times (the 23:59 EOD default, an imported due date) get their own
  // row rather than being snapped away under the user.
  const times = useMemo(() => {
    if (!selectedTime || SLOTS.includes(selectedTime)) return SLOTS
    return [...SLOTS, selectedTime].sort()
  }, [selectedTime])

  // Open on the selected slot instead of at midnight.
  useEffect(() => {
    const list = timeListRef.current
    const active = list?.querySelector('[data-selected="true"]') as HTMLElement | null
    if (list && active) list.scrollTop = active.offsetTop - list.clientHeight / 2 + active.clientHeight / 2
  }, [])

  const commit = (date: string, time: string) => onChange(`${date}T${time}`)

  const pickDay = (d: Date) => {
    const time = selectedTime ?? nextSlotTime()
    commit(dateKey(d), time)
    if (d.getMonth() !== month.getMonth()) setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
  }

  const pickTime = (time: string) => {
    commit(selectedDate, time)
    onClose()
  }

  const shiftDays = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    const time = selectedTime ?? nextSlotTime()
    commit(dateKey(d), time)
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
  }

  const todayKey = dateKey(new Date())
  const days = monthGrid(month)

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Choose date and time"
        className="fixed z-50 flex max-w-[95vw] gap-2 rounded-md border bg-popover p-2 text-popover-foreground shadow-elevation-4"
        style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999, visibility: pos ? 'visible' : 'hidden' }}
      >
        {/* Calendar */}
        <div className="w-[236px]">
          <div className="mb-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              aria-label="Previous month"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-medium">
              {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              aria-label="Next month"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 px-0.5 pb-1 text-center text-[10px] uppercase tracking-wide text-muted-foreground/70">
            {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {days.map((d) => {
              const key = dateKey(d)
              const outside = d.getMonth() !== month.getMonth()
              const selected = key === selectedDate && !!parts
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => pickDay(d)}
                  aria-pressed={selected}
                  className={cn(
                    'h-7 rounded text-xs tabular-nums transition-colors',
                    outside ? 'text-muted-foreground/40' : 'text-foreground',
                    selected
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted',
                    !selected && key === todayKey && 'font-semibold ring-1 ring-inset ring-border',
                  )}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          <div className="mt-1.5 flex gap-1">
            {[['Today', 0], ['Tomorrow', 1], ['Next week', 7]].map(([label, days]) => (
              <button
                key={label as string}
                type="button"
                onClick={() => shiftDays(days as number)}
                className="flex-1 rounded border border-border px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {label as string}
              </button>
            ))}
          </div>
        </div>

        {/* Time slots — 15-minute windows */}
        <div className="flex w-[104px] flex-col">
          <input
            type="time"
            step={MINUTE_STEP * 60}
            value={selectedTime ?? ''}
            onChange={(e) => { if (e.target.value) commit(selectedDate, e.target.value.slice(0, 5)) }}
            aria-label="Time"
            className="mb-1 h-7 w-full rounded border border-input bg-transparent px-1.5 text-xs tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div ref={timeListRef} className="max-h-[236px] flex-1 overflow-y-auto pr-0.5">
            {times.map((t) => {
              const selected = t === selectedTime
              return (
                <button
                  key={t}
                  type="button"
                  data-selected={selected}
                  onClick={() => pickTime(t)}
                  aria-pressed={selected}
                  className={cn(
                    'block w-full rounded px-2 py-1 text-left text-xs tabular-nums transition-colors',
                    selected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  {formatTimeLabel(t)}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
