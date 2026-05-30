import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { io, Socket } from 'socket.io-client'
import { LayoutDashboard, RefreshCw, Search, Wifi, WifiOff, X } from 'lucide-react'
import { API_URL, WS_URL } from '@/config/api'
import { api } from '@/lib/api'
import { getDocumentDisplayInfo } from '@/lib/document-display'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

const FILE_SCHEMA = 'data/abstraction/file'

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
  if (document.schema === 'data/abstraction/tab') {
    const url = String(document.data?.url || '').trim()
    return isHttpUrl(url) ? url : null
  }
  if (display.isExternal && isHttpUrl(display.subtitle)) return display.subtitle
  if (isHttpUrl(display.title)) return display.title
  return null
}

function publicDocumentContentUrl(code: string, documentId: number) {
  return `${API_URL}/pub/c/${encodeURIComponent(code)}/documents/${documentId}/content`
}

function linkify(value: string) {
  const parts = value.split(/(https?:\/\/[^\s]+)/gi)
  return parts.map((part, index) => (
    isHttpUrl(part)
      ? (
        <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer" className="underline decoration-neutral-300 underline-offset-2 hover:text-violet-700">
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
    load()
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

  if (isLoading && !payload) {
    return (
      <main className="min-h-screen bg-neutral-100 flex items-center justify-center p-6">
        <div className="text-sm text-neutral-500">Loading canvas...</div>
      </main>
    )
  }

  if (error || !payload) {
    return (
      <main className="min-h-screen bg-neutral-100 flex items-center justify-center p-6">
        <Card className="max-w-md bg-white">
          <CardHeader>
            <CardTitle>Canvas unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-neutral-600">
            {error || 'This public canvas does not exist.'}
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-neutral-100 p-4 text-neutral-950 md:p-10">
      <div className="mx-auto max-w-6xl">
        <Card className="bg-white shadow-xl">
          <CardHeader className="border-b">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex min-w-0 gap-4">
                <div
                  className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"
                  style={payload.canvas.color ? { borderLeft: `4px solid ${payload.canvas.color}` } : undefined}
                >
                  <LayoutDashboard className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wide text-neutral-500">
                    {payload.workspace.label || payload.workspace.name}
                  </div>
                  <CardTitle className="mt-1 truncate text-3xl md:text-5xl">
                    {payload.canvas.label || payload.canvas.name || 'Canvas'}
                  </CardTitle>
                  {payload.canvas.description && (
                    <p className="mt-3 max-w-3xl text-base text-neutral-600">
                      {payload.canvas.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs text-neutral-600">
                {isLive ? <Wifi className="h-3.5 w-3.5 text-green-600" /> : <WifiOff className="h-3.5 w-3.5 text-neutral-400" />}
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

            <section className="rounded-2xl border">
              <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between">
                <h2 className="font-semibold">Content</h2>
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                  <form onSubmit={submitSearch} className="flex min-w-0 items-center gap-2">
                    <div className="relative min-w-0">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
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
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                          aria-label="Clear search"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <button type="submit" className="rounded-md border px-3 py-1.5 text-xs hover:bg-neutral-50">
                      Search
                    </button>
                  </form>
                  <button
                    type="button"
                    onClick={load}
                    className="inline-flex items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-xs hover:bg-neutral-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>
              {searchQuery.trim() && (
                <div className="border-b bg-neutral-50 px-4 py-2 text-xs text-neutral-600">
                  Local search: <span className="font-mono">"{searchQuery.trim()}"</span>
                </div>
              )}
              <div className="divide-y">
                {filteredDocuments.length === 0 ? (
                  <div className="p-8 text-center text-sm text-neutral-500">
                    {searchQuery.trim() ? 'No loaded documents match your search.' : 'No documents yet.'}
                  </div>
                ) : filteredDocuments.map((document) => {
                  const display = getPublicDocumentDisplay(document)
                  const link = getDocumentLink(document, display)
                  return (
                    <article key={document.id} className="p-4">
                      <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <h3 className="truncate font-medium">
                            {link ? (
                              <a href={link} target="_blank" rel="noreferrer" className="hover:text-violet-700 hover:underline">
                                {display.title}
                              </a>
                            ) : display.title}
                          </h3>
                          <div className="mt-1 font-mono text-xs text-neutral-500">{display.schemaLabel}</div>
                        </div>
                        <time className="shrink-0 text-xs text-neutral-500">
                          {formatDate(document.updatedAt || document.createdAt)}
                        </time>
                      </div>
                      {display.preview && (
                        <p className="mt-3 line-clamp-3 text-sm leading-6 text-neutral-700">
                          {linkify(display.preview)}
                        </p>
                      )}
                      {isImageFile(document) && (
                        <img
                          src={publicDocumentContentUrl(code, document.id)}
                          alt={display.title}
                          loading="lazy"
                          className="mt-3 max-h-64 max-w-full rounded border bg-neutral-50 object-contain"
                        />
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border bg-neutral-50 p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-2 truncate text-lg font-semibold ${mono ? 'font-mono text-sm' : ''}`}>
        {value || '-'}
      </div>
    </div>
  )
}

