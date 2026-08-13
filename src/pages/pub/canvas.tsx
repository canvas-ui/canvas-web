import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { io, Socket } from 'socket.io-client'
import { Download, LayoutDashboard, RefreshCw, Search, Wifi, WifiOff, X } from 'lucide-react'
import { API_URL, WS_URL } from '@/config/api'
import { api } from '@/lib/api'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CanvasGrid } from '@/components/canvas/CanvasGrid'
import { PublicShareContext, publicDocumentContentUrl as buildPublicContentUrl } from '@/components/renderers/public-share'
import { SourceLink } from '@/components/common/source-link'
import type { Document, TreeNode } from '@/types/workspace'

interface PublicCanvasPayload {
  share: {
    code: string
    url: string
    treeName: string
    treeType: string
    path: string
    createdAt: string
  }
  workspace: {
    name: string
    label?: string
    description?: string
    color?: string | null
  }
  canvas: TreeNode & {
    path: string
    treeName: string
    treeType: string
  }
  stats: {
    documentCount: number
    returnedCount: number
    refreshedAt: string
  }
  documents: {
    data?: Document[]
    count?: number
    totalCount?: number
  } | Document[]
}

const FILE_SCHEMA = 'data/schema/file'

function getFileUrl(document: Document) {
  return String(document.locations?.[0]?.url || '').trim()
}

function getFileName(document: Document) {
  const url = getFileUrl(document)
  if (!url) return ''
  const withoutQuery = url.split(/[?#]/)[0]
  const base = withoutQuery.split('/').filter(Boolean).pop() || ''
  try { return decodeURIComponent(base) } catch { return base }
}

function isImageFile(document: Document) {
  return document.schema === FILE_SCHEMA && String(document.metadata?.contentType || '').startsWith('image/')
}

function formatBytes(value: unknown) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function getPublicDocumentDisplay(document: Document) {
  if (document.schema !== FILE_SCHEMA) return getDocumentDisplayInfo(document)

  const name = getFileName(document)
  const mime = String(document.metadata?.contentType || '').trim()
  const size = formatBytes(document.metadata?.size)
  return {
    ...getDocumentDisplayInfo(document),
    title: name || `File ${document.id}`,
    preview: [mime, size].filter(Boolean).join(' · '),
    subtitle: getFileUrl(document),
    schemaLabel: 'file',
  }
}

function isHttpUrl(value: string) {
  return /^https?:\/\/[^\s]+$/i.test(value)
}

function getDocumentLink(document: Document, display: ReturnType<typeof getDocumentDisplayInfo>) {
  if (document.schema === 'data/schema/tab') {
    const url = String(document.data?.url || '').trim()
    return isHttpUrl(url) ? url : null
  }
  if (display.isExternal && isHttpUrl(display.subtitle)) return display.subtitle
  if (isHttpUrl(display.title)) return display.title
  return null
}

function publicDocumentContentUrl(code: string, documentId: number, download = false) {
  return buildPublicContentUrl(code, documentId, { download })
}

function linkify(value: string) {
  const parts = value.split(/(https?:\/\/[^\s]+)/gi)
  return parts.map((part, index) => (
    isHttpUrl(part)
      ? (
        <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer" className="underline decoration-muted-foreground underline-offset-2 hover:text-primary">
          {part}
        </a>
      )
      : part
  ))
}

function formatDate(value?: string) {
  if (!value) return ''
  return new Date(value).toLocaleString()
}

export default function PublicCanvasPage() {
  const { code = '' } = useParams<{ code: string }>()
  const [payload, setPayload] = useState<PublicCanvasPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isLive, setIsLive] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const documents = useMemo(() => {
    if (!payload?.documents) return []
    return Array.isArray(payload.documents) ? payload.documents : payload.documents.data || []
  }, [payload])
  const filteredDocuments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return documents
    return documents.filter((document) => {
      const display = getPublicDocumentDisplay(document)
      const haystack = [
        document.schema,
        display.title,
        display.preview,
        display.subtitle,
        getFileName(document),
        document.metadata?.contentType,
      ].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [documents, searchQuery])

  const load = useCallback(async () => {
    if (!code) return
    setIsLoading(true)
    try {
      const response = await api.get<{ payload: PublicCanvasPayload }>(
        `${API_URL}/pub/c/${encodeURIComponent(code)}`,
        { skipAuth: true }
      )
      setPayload(response.payload)
      setError(null)
    } catch (err) {
      setPayload(null)
      setError(err instanceof Error ? err.message : 'Failed to load public canvas')
    } finally {
      setIsLoading(false)
    }
  }, [code])

  useEffect(() => {
    const run = () => load()
    void run()
  }, [load])

  useEffect(() => {
    if (!code) return
    let socket: Socket | null = io(`${WS_URL}/pub`, {
      transports: ['websocket'],
      auth: { code },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    })

    socket.on('connect', () => setIsLive(true))
    socket.on('disconnect', () => setIsLive(false))
    socket.on('connect_error', () => setIsLive(false))
    socket.on('canvas:changed', () => load())

    return () => {
      socket?.disconnect()
      socket = null
    }
  }, [code, load])

  const submitSearch = useCallback((event?: FormEvent) => {
    event?.preventDefault()
    setSearchQuery(searchQuery.trim())
  }, [searchQuery])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
  }, [])

  const publicFetchDocuments = useCallback(async () => ({
    payload: documents,
    totalCount: payload?.stats.documentCount ?? documents.length,
  }), [documents, payload])

  if (isLoading && !payload) {
    return (
      <main className="min-h-screen bg-muted flex items-center justify-center p-6">
        <div className="text-sm text-muted-foreground">Loading canvas...</div>
      </main>
    )
  }

  if (error || !payload) {
    return (
      <main className="min-h-screen bg-muted flex flex-col items-center justify-center p-6">
        <Card className="max-w-md bg-card">
          <CardHeader>
            <CardTitle>Canvas unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {error || 'This public canvas does not exist.'}
          </CardContent>
        </Card>
        <SourceLink className="mt-6 text-center" />
      </main>
    )
  }

  const canvasUi = (payload.canvas.metadata?.ui ?? {}) as { widgets?: Record<string, unknown> }
  const hasWidgets = !!canvasUi.widgets && Object.keys(canvasUi.widgets).length > 0

  return (
    <PublicShareContext.Provider value={code}>
    <main className="min-h-screen bg-muted p-4 text-foreground md:p-10">
      <div className="mx-auto max-w-6xl">
        <Card className="bg-card shadow-elevation-3">
          <CardHeader className="border-b">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex min-w-0 gap-4">
                <div
                  className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary"
                  style={payload.canvas.color ? { borderLeft: `4px solid ${payload.canvas.color}` } : undefined}
                >
                  <LayoutDashboard className="h-6 w-6 touch-target" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {payload.workspace.label || payload.workspace.name}
                  </div>
                  <CardTitle className="mt-1 truncate text-3xl md:text-5xl">
                    {payload.canvas.label || payload.canvas.name || 'Canvas'}
                  </CardTitle>
                  {payload.canvas.description && (
                    <p className="mt-3 max-w-3xl text-base text-muted-foreground">
                      {payload.canvas.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
                {isLive ? <Wifi className="h-3.5 w-3.5 text-success" /> : <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />}
                {isLive ? 'Live' : 'Offline'}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 p-6 md:p-8">
            <section className="grid gap-3 md:grid-cols-4">
              <Stat label="Path" value={payload.share.path} mono />
              <Stat label="Documents" value={String(payload.stats.documentCount)} />
              <Stat label="Shown" value={String(filteredDocuments.length)} />
              <Stat label="Refreshed" value={formatDate(payload.stats.refreshedAt)} />
            </section>

            {hasWidgets && (
              <section id="content-area" className="rounded-2xl border overflow-hidden flex flex-col w-full h-viewport-pane min-h-[420px]">
                <CanvasGrid
                  key={JSON.stringify(canvasUi)}
                  workspaceId={payload.workspace.name}
                  treeName={payload.share.treeName}
                  path={payload.share.path}
                  layerId={payload.canvas.id}
                  querySpec={payload.canvas.querySpec}
                  metadata={payload.canvas.metadata}
                  readOnly
                  interactive={false}
                  fetchDocuments={publicFetchDocuments}
                />
              </section>
            )}

            {!hasWidgets && (
            <section className="rounded-2xl border">
              <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between">
                <h2 className="font-semibold">Content</h2>
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                  <form onSubmit={submitSearch} className="flex min-w-0 items-center gap-2">
                    <div className="relative min-w-0">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search loaded documents..."
                        className="w-full rounded-md border py-1.5 pl-9 pr-8 text-sm md:w-72"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={clearSearch}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label="Clear search"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <button type="submit" className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
                      Search
                    </button>
                  </form>
                  <button
                    type="button"
                    onClick={load}
                    className="inline-flex items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>
              {searchQuery.trim() && (
                <div className="border-b bg-muted px-4 py-2 text-xs text-muted-foreground">
                  Local search: <span className="font-mono">"{searchQuery.trim()}"</span>
                </div>
              )}
              <div className="divide-y">
                {filteredDocuments.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    {searchQuery.trim() ? 'No loaded documents match your search.' : 'No documents yet.'}
                  </div>
                ) : filteredDocuments.map((document) => {
                  const display = getPublicDocumentDisplay(document)
                  const link = getDocumentLink(document, display)
                  const isFile = document.schema === FILE_SCHEMA
                  const fileUrl = isFile ? publicDocumentContentUrl(code, document.id) : null
                  const openUrl = fileUrl || link
                  return (
                    <article key={document.id} className="p-4">
                      <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <h3 className="truncate font-medium">
                            {openUrl ? (
                              <a href={openUrl} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">
                                {display.title}
                              </a>
                            ) : display.title}
                          </h3>
                          <div className="mt-1 font-mono text-xs text-muted-foreground">{display.schemaLabel}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {isFile && (
                            <a
                              href={publicDocumentContentUrl(code, document.id, true)}
                              download={display.title}
                              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Download
                            </a>
                          )}
                          <time className="text-xs text-muted-foreground">
                            {formatDate(document.updatedAt || document.createdAt)}
                          </time>
                        </div>
                      </div>
                      {display.preview && (
                        <p className="mt-3 line-clamp-3 text-sm leading-6 text-foreground">
                          {linkify(display.preview)}
                        </p>
                      )}
                      {isImageFile(document) && (
                        <a href={fileUrl || undefined} target="_blank" rel="noreferrer" className="mt-3 block w-fit">
                          <img
                            src={fileUrl || undefined}
                            alt={display.title}
                            loading="lazy"
                            className="max-h-64 max-w-full rounded border bg-muted object-contain transition-opacity hover:opacity-90"
                          />
                        </a>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
            )}
          </CardContent>
        </Card>
        <SourceLink className="mt-6 text-center" />
      </div>
    </main>
    </PublicShareContext.Provider>
  )
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border bg-muted p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-2 truncate text-lg font-semibold ${mono ? 'font-mono text-sm' : ''}`}>
        {value || '-'}
      </div>
    </div>
  )
}

