import { useCallback, useSyncExternalStore } from 'react'
import type { Document } from '@/types/workspace'

/*
 * Documents that mirror a remote object.
 *
 * A synced GitHub issue / calendar event / chat message carries a connector
 * provenance URL among its locations. Editing one is not a local write: the
 * server sends the change to the source FIRST and only then updates the mirror
 * (canvas-server, Workspace#connectorWriteThrough), so the round trip includes
 * a call to github.com and takes noticeably longer than saving a note. The UI
 * has to say so, or an edit just looks frozen.
 */

// Provenance scheme -> the source's name, mirroring the driver registry in
// canvas-server (services/connectors/registry.js). Kept static rather than
// fetched from GET /backends/drivers: it is two words per driver, and every
// surface that renders a document would otherwise need the workspace id and an
// async load before it could draw a row.
const MIRROR_LABELS: Record<string, string> = {
  gh: 'GitHub',
  slack: 'Slack',
  gcal: 'Google Calendar',
  caldav: 'CalDAV',
  msteams: 'Microsoft Teams',
}

export interface RemoteMirror {
  /** Provenance scheme, e.g. 'gh'. */
  scheme: string
  /** Human name of the source, e.g. 'GitHub'. */
  label: string
  /** The provenance URL itself (gh://owner/repo/issues/7). */
  url: string
}

/** The remote source a document mirrors, or null for an ordinary document. */
export function getRemoteMirror(document: Document): RemoteMirror | null {
  for (const location of document.locations || []) {
    const url = location?.url
    if (typeof url !== 'string') continue
    const separator = url.indexOf('://')
    if (separator <= 0) continue
    const scheme = url.slice(0, separator)
    const label = MIRROR_LABELS[scheme]
    if (label) return { scheme, label, url }
  }
  return null
}

/* ── In-flight document writes ──────────────────────────────────────────────
 *
 * One registry for "this document is being saved right now", written by
 * updateWorkspaceDocument and read by whatever happens to be rendering the
 * document. Going through a store rather than local component state is what
 * lets the card, the list row and the widget all dim the same task while one
 * of them is saving it — they rarely share a parent.
 */

const inFlight = new Map<number, number>() // document id -> concurrent writes
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function beginDocumentSave(documentId: number): void {
  inFlight.set(documentId, (inFlight.get(documentId) || 0) + 1)
  notify()
}

export function endDocumentSave(documentId: number): void {
  const count = (inFlight.get(documentId) || 0) - 1
  if (count > 0) inFlight.set(documentId, count)
  else inFlight.delete(documentId)
  notify()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * Is a write for this document currently in flight?
 *
 * The snapshot is the boolean itself, not a store version: every subscriber is
 * woken on any save, but only the rows whose own answer changed re-render — a
 * fifty-row list ticking over on someone else's save would be pure waste.
 */
export function useDocumentSaving(documentId: number | null | undefined): boolean {
  const getSnapshot = useCallback(
    () => documentId != null && inFlight.has(documentId),
    [documentId],
  )
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

export interface MirrorSaveState {
  mirror: RemoteMirror | null
  /** A write is in flight AND it has to reach a remote source. */
  replicating: boolean
  /** 'Replicating to GitHub…' — ready to render, empty when not replicating. */
  label: string
}

/**
 * What to tell the user about a document's save, if anything. Only remote
 * mirrors get an indicator: a local write resolves too fast for a spinner to
 * be anything but flicker.
 */
export function useMirrorSaveState(document: Document): MirrorSaveState {
  const saving = useDocumentSaving(document.id)
  const mirror = getRemoteMirror(document)
  const replicating = saving && mirror != null
  return { mirror, replicating, label: replicating ? `Replicating to ${mirror!.label}…` : '' }
}
