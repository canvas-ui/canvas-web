/**
 * DocumentsCard — compact document list for M2 panels.
 * Re-fetches when `path` or `fetchKey` changes.
 * Each document renders as a small Canva-style card.
 */
import { useEffect, useState } from 'react'
import { FileText, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Document } from '@/types/workspace'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function docTitle(doc: Document): string {
  const d = doc.data
  return d?.title || d?.name || d?.subject || d?.label || d?.email || `#${doc.id}`
}

function schemaShort(schema: string): string {
  return schema.split('/').pop() || schema
}

function relativeDate(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  } catch { return '' }
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DocumentsCardProps {
  /** Async function that fetches documents for the current path/context */
  fetchDocuments: () => Promise<Document[]>
  /** Changing this triggers a re-fetch (e.g. pass selectedPath or context url) */
  fetchKey: string
  label?: string
  className?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DocumentsCard({ fetchDocuments, fetchKey, label, className }: DocumentsCardProps) {
  const [docs, setDocs] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    fetchDocuments()
      .then(result => {
        if (!cancelled) {
          // result may be an array with attached count
          const arr = Array.isArray(result) ? result : []
          setDocs(arr.slice(0, 20))
          setTotal((arr as any).totalCount ?? (arr as any).count ?? arr.length)
        }
      })
      .catch(() => { if (!cancelled) setDocs([]) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [fetchKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Header row */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1 shrink-0">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label || 'Documents'}
          {total > 0 && <span className="ml-1 text-muted-foreground/60">({total})</span>}
        </span>
        {isLoading && <RefreshCw className="w-3 h-3 text-muted-foreground animate-spin" />}
      </div>

      {/* Content */}
      {docs.length === 0 && !isLoading ? (
        <div className="px-3 pb-2 text-xs text-muted-foreground italic">No documents</div>
      ) : (
        <div className="px-2 pb-2 space-y-1">
          {docs.map(doc => (
            <div
              key={doc.id}
              className="group flex items-start gap-2 rounded-md px-2 py-1.5 bg-card hover:bg-accent/40 shadow-sm transition-colors cursor-default"
            >
              <FileText className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="truncate text-xs font-medium leading-tight">
                  {docTitle(doc)}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded truncate max-w-[80px]">
                    {schemaShort(doc.schema)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {relativeDate(doc.updatedAt || doc.createdAt)}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {total > docs.length && (
            <div className="text-center text-[10px] text-muted-foreground py-0.5">
              +{total - docs.length} more
            </div>
          )}
        </div>
      )}
    </div>
  )
}
