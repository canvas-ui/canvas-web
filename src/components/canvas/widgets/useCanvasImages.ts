import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WidgetCanvasContext } from '../widget-types'
import type { Document } from '@/types/workspace'
import { DEFAULT_TIMELINE_SORT, type TimelineSort } from './sort-control'

const FILE_SCHEMA = 'data/abstraction/file'

export function isImageDoc(doc: Document): boolean {
  return doc.schema === FILE_SCHEMA && String(doc.metadata?.contentType || '').startsWith('image/')
}

// Modality-level MIME presence bitmap: every image doc carries it, so the
// server returns only images and `totalCount` is an exact image count.
const IMAGE_MIME_FEATURE = 'data/mime/image'

export interface CanvasImages {
  images: Document[]
  isLoading: boolean
  error: string | null
  // Pagination + counts are server-side and image-exact (the `data/mime/image`
  // bitmap filters images server-side). `isImageDoc` still runs as a fallback
  // for read-only public shares, which feed preloaded docs and ignore filters.
  page: number
  setPage: (page: number) => void
  totalCount: number
  totalPages: number
  // Search: `input` is the buffered term; `submit()` promotes it to the active
  // query and resets to page 1. Only the term is user-controlled.
  input: string
  setInput: (value: string) => void
  submit: () => void
  clearSearch: () => void
  activeQuery: string
  sort: TimelineSort
  setSort: (next: TimelineSort) => void
}

// Shared data layer for the Gallery and Mosaic widgets: paginated, searchable,
// timeline-sortable image loading over the canvas' document context.
export function useCanvasImages(canvas: WidgetCanvasContext, pageSize: number): CanvasImages {
  const [images, setImages] = useState<Document[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [sort, setSort] = useState<TimelineSort>(DEFAULT_TIMELINE_SORT)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const res = await canvas.fetchDocuments({
          limit: pageSize,
          page,
          q: activeQuery || undefined,
          sortBy: sort.sortBy,
          order: sort.order,
          allOf: [IMAGE_MIME_FEATURE],
        })
        if (cancelled) return
        setImages((res.payload || []).filter(isImageDoc))
        setTotalCount(res.totalCount || res.count || 0)
      } catch (err) {
        if (cancelled) return
        setImages([])
        setTotalCount(0)
        setError(err instanceof Error ? err.message : 'Failed to load images')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [canvas, pageSize, page, activeQuery, sort.sortBy, sort.order])

  const submit = useCallback(() => {
    setActiveQuery(input.trim())
    setPage(1)
  }, [input])

  const clearSearch = useCallback(() => {
    setInput('')
    setActiveQuery('')
    setPage(1)
  }, [])

  const changeSort = useCallback((next: TimelineSort) => {
    setSort(next)
    setPage(1)
  }, [])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / pageSize)),
    [totalCount, pageSize],
  )

  return {
    images, isLoading, error,
    page, setPage, totalCount, totalPages,
    input, setInput, submit, clearSearch, activeQuery,
    sort, setSort: changeSort,
  }
}
