import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QueryDebugData } from '@/lib/query-debug'

/**
 * Search metadata for floor calibration: the raw, UNFLOORED image kNN cosine
 * distances for the query (0 = identical, 1 = orthogonal, 2 = opposite),
 * best-first, as returned by the server.
 *
 * How to read it: walk down the list until the photos stop being relevant —
 * that boundary is where to set the image relevance floor (Settings → Database
 * → Search tuning). Set it just ABOVE the last true match. The biggest gap
 * between consecutive distances is usually that boundary, so it is marked.
 *
 * With a refine stack these are the distances for the LAST query, measured
 * inside the scope the earlier queries narrowed to — which is exactly what
 * decides the refine's precision.
 */
export function QueryDebugPanel({ data, className }: { data: QueryDebugData; className?: string }) {
  const [open, setOpen] = useState(true)

  const { rows, gapIndex, span } = useMemo(() => {
    const sorted = [...data.distances].sort((a, b) => a.distance - b.distance)
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) { gaps.push(sorted[i].distance - sorted[i - 1].distance) }

    // The largest jump is only a BOUNDARY if it stands out against the typical
    // spacing. In a tight cluster every gap is noise, and marking the biggest
    // one invites a floor picked from nothing — the failure this panel exists
    // to prevent. Require it to be several times the median spacing.
    const median = gaps.length
      ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
      : 0
    let gapIndex = -1
    let biggest = 0
    for (let i = 0; i < gaps.length; i++) {
      if (gaps[i] > biggest) { biggest = gaps[i]; gapIndex = i + 1 }
    }
    const significant = gapIndex > 0 && biggest >= Math.max(median * 4, 1e-6)
    const first = sorted[0]?.distance ?? 0
    const last = sorted[sorted.length - 1]?.distance ?? 0
    return {
      rows: sorted,
      gapIndex: significant ? gapIndex : -1,
      span: { first, last, biggest, median },
    }
  }, [data.distances])

  if (rows.length === 0) {
    return (
      <div className={cn('rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground', className)}>
        Query debug: no image distances for “{data.query}”. The dense side returned nothing:
        either no photos are embedded in this scope, or the image space is not ready.
      </div>
    )
  }

  const suggested = gapIndex > 0 ? rows[gapIndex].distance : null

  return (
    <div className={cn('rounded-md border border-border bg-muted/30 text-xs', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left font-medium"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Query debug
        <span className="font-normal text-muted-foreground">
          : image distances for “{data.query}” ({rows.length} nearest, unfloored)
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          <p className="text-[11px] text-muted-foreground">
            Best-first cosine distance (0 = identical). Scroll to where the photos stop being
            relevant and set the image relevance floor just above that value in
            Settings → Database → Search tuning.
            {suggested !== null ? (
              <> A jump at <span className="font-mono">{suggested.toFixed(4)}</span> (Δ{span.biggest.toFixed(4)}, vs typical Δ{span.median.toFixed(4)}) stands out (a likely boundary).</>
            ) : (
              <> <span className="text-amber-600 dark:text-amber-500">No boundary in this window</span>; the
              distances step evenly (typical Δ{span.median.toFixed(4)}), so there is nothing here to
              set a floor from. Relevance probably ends further down the list than this window
              reaches, or the model is not separating this query at all.</>
            )}
          </p>

          <div className="max-h-56 overflow-y-auto">
            <table className="w-full font-mono text-[11px]">
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-b border-border/40 last:border-0',
                      i === gapIndex && 'border-t-2 border-t-amber-500/70',
                    )}
                  >
                    <td className="py-0.5 pr-3 text-muted-foreground">{i + 1}</td>
                    <td className="py-0.5 pr-3">#{row.id}</td>
                    <td className="py-0.5 tabular-nums">{row.distance.toFixed(4)}</td>
                    {i === gapIndex && (
                      <td className="py-0.5 pl-2 font-sans text-[10px] text-amber-600 dark:text-amber-500">
                        ← biggest gap
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Range {span.first.toFixed(4)} – {span.last.toFixed(4)} (spread {(span.last - span.first).toFixed(4)})
            over {rows.length} rows. Absolute values shift with the model and are not comparable
            across models. After a re-embed every floor has to be picked again. A spread this
            narrow relative to the range means ranking is doing the work, not distance.
          </p>
        </div>
      )}
    </div>
  )
}
