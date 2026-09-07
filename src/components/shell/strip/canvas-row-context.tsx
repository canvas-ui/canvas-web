import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Document } from '@/types/workspace'
import { SideViewContext, type SideViewContextValue } from '../use-side-view'
import { CanvasRowContext, MAIN_COLUMN, type CanvasEntry, type CanvasEntrySpec, type CanvasRow, type CanvasRowValue } from './use-canvas-row'

const DESK_ROW: CanvasRow = { key: 'desk', label: 'Desk', main: '/', mainExpanded: false, entries: [] }

let seq = 0
const nextId = () => `c${++seq}`

function sameEntry(a: CanvasEntrySpec, b: CanvasEntry): boolean {
  if (a.kind === 'route' && b.kind === 'route') return a.location === b.location
  if (a.kind === 'document' && b.kind === 'document') return a.document.id === b.document.id && a.workspaceId === b.workspaceId
  return false
}

// Strip-mode state host. Also provides SideViewContext, so every existing
// "open to the side" caller (document lists, the relations panel, …) opens a
// canvas to the right instead of the classic single side card — no caller
// needs to know which layout is on.
export function CanvasRowProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [rows, setRows] = useState<CanvasRow[]>([DESK_ROW])
  const [activeRow, setActiveRow] = useState(0)
  const [focus, setFocus] = useState<string>(MAIN_COLUMN)
  // Refs so the actions below can read state and produce plain setState
  // calls — no navigation or second setState from inside an updater (those
  // run twice under StrictMode and may run during render).
  // The actions also write the refs eagerly, so two actions in one event see
  // each other; this effect is the resync after React applied the state.
  const rowsRef = useRef(rows)
  const activeRowRef = useRef(activeRow)
  const focusRef = useRef(focus)
  useEffect(() => {
    rowsRef.current = rows
    activeRowRef.current = activeRow
    focusRef.current = focus
  }, [rows, activeRow, focus])

  const replaceRow = useCallback((i: number, row: CanvasRow) => {
    const next = rowsRef.current.slice()
    next[i] = row
    rowsRef.current = next
    setRows(next)
  }, [])

  const updateActive = useCallback((fn: (row: CanvasRow) => CanvasRow) => {
    const i = activeRowRef.current
    const row = rowsRef.current[i]
    if (row) replaceRow(i, fn(row))
  }, [replaceRow])

  // URL → active row's main. Mirrors classic behavior: the tree navigates the
  // browser, and the row remembers where it is for when the user comes back.
  const here = location.pathname + location.search
  useEffect(() => {
    updateActive((row) => (row.main === here ? row : { ...row, main: here }))
  }, [here, updateActive])

  const openCanvas = useCallback((entry: CanvasEntrySpec) => {
    const row = rowsRef.current[activeRowRef.current]
    if (!row) return
    const existing = row.entries.find((e) => sameEntry(entry, e))
    if (existing) {
      setFocus(existing.id)
      return
    }
    const created: CanvasEntry = { ...entry, id: nextId() }
    // Insert right of the focused canvas so "open from canvas A" lands
    // beside A, not at the far end of the row.
    const at = row.entries.findIndex((e) => e.id === focusRef.current)
    const entries = row.entries.slice()
    entries.splice(at >= 0 ? at + 1 : entries.length, 0, created)
    updateActive((r) => ({ ...r, entries }))
    focusRef.current = created.id
    setFocus(created.id)
  }, [updateActive])

  const openDocument = useCallback((document: Document, workspaceId: string) => {
    openCanvas({ kind: 'document', document, workspaceId })
  }, [openCanvas])

  const closeCanvas = useCallback((id: string) => {
    updateActive((row) => ({ ...row, entries: row.entries.filter((e) => e.id !== id) }))
    setFocus((f) => (f === id ? MAIN_COLUMN : f))
  }, [updateActive])

  const navigateCanvas = useCallback((id: string, next: string) => {
    updateActive((row) => ({
      ...row,
      entries: row.entries.map((e) => (e.id === id && e.kind === 'route' ? { ...e, location: next } : e)),
    }))
  }, [updateActive])

  const toggleExpanded = useCallback((id: string) => {
    updateActive((row) =>
      id === MAIN_COLUMN
        ? { ...row, mainExpanded: !row.mainExpanded }
        : { ...row, entries: row.entries.map((e) => (e.id === id ? { ...e, expanded: !e.expanded } : e)) },
    )
  }, [updateActive])

  const goToRow = useCallback((i: number) => {
    const row = rowsRef.current[i]
    if (!row) return
    activeRowRef.current = i
    setActiveRow(i)
    setFocus(MAIN_COLUMN)
    navigate(row.main)
  }, [navigate])

  const activateRow = useCallback((key: string, label: string, main: string) => {
    const i = rowsRef.current.findIndex((r) => r.key === key)
    if (i >= 0) {
      goToRow(i)
      return
    }
    const next = [...rowsRef.current, { key, label, main, mainExpanded: false, entries: [] }]
    rowsRef.current = next
    setRows(next)
    goToRow(next.length - 1)
  }, [goToRow])

  const moveRow = useCallback((delta: number) => {
    goToRow(activeRowRef.current + delta)
  }, [goToRow])

  const closeRow = useCallback((key: string) => {
    const i = rowsRef.current.findIndex((r) => r.key === key)
    if (i <= 0) return // the desk row stays
    const next = rowsRef.current.filter((r) => r.key !== key)
    rowsRef.current = next
    setRows(next)
    const current = activeRowRef.current
    if (current === i) goToRow(Math.min(i, next.length - 1))
    else if (current > i) { activeRowRef.current = current - 1; setActiveRow(current - 1) }
  }, [goToRow])

  const value = useMemo<CanvasRowValue>(
    () => ({ rows, activeRow, focus, setFocus, openCanvas, openDocument, closeCanvas, navigateCanvas, toggleExpanded, activateRow, moveRow, closeRow }),
    [rows, activeRow, focus, openCanvas, openDocument, closeCanvas, navigateCanvas, toggleExpanded, activateRow, moveRow, closeRow],
  )

  const sideView = useMemo<SideViewContextValue>(
    () => ({ entry: null, open: openDocument, close: () => {} }),
    [openDocument],
  )

  return (
    <CanvasRowContext.Provider value={value}>
      <SideViewContext.Provider value={sideView}>{children}</SideViewContext.Provider>
    </CanvasRowContext.Provider>
  )
}
