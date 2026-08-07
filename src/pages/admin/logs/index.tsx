import { PageHeader } from '@/components/common/page-header'
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Activity, Pause, Play, RotateCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast-container"
import { adminService, type AdminLogEntry, type AdminLogFilters } from "@/services/admin"
import { getCurrentUserFromToken } from "@/services/auth"

const DEFAULT_FILTERS: Required<AdminLogFilters> = {
  tail: 200,
  level: "",
  module: "",
}

const MAX_CLIENT_LOGS = 1000

function mergeLogBuffer(entries: AdminLogEntry[]) {
  return entries.slice(-MAX_CLIENT_LOGS)
}

function getLogLineColor(entry: AdminLogEntry) {
  switch (entry.levelLabel) {
    case "fatal":
      return "text-destructive"
    case "error":
      return "text-destructive"
    case "warn":
      return "text-warning"
    case "info":
      return "text-info"
    case "debug":
      return "text-muted-foreground"
    case "trace":
      return "text-muted-foreground"
    default:
      return "text-success"
  }
}

export default function AdminLogsPage() {
  const currentUser = getCurrentUserFromToken()
  const isCurrentUserAdmin = currentUser?.userType === "admin"
  const { showToast } = useToast()
  const logContainerRef = useRef<HTMLDivElement | null>(null)

  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [draftFilters, setDraftFilters] = useState(DEFAULT_FILTERS)
  const [logs, setLogs] = useState<AdminLogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSnapshot = useCallback(async (nextFilters: AdminLogFilters) => {
    try {
      setIsLoading(true)
      const snapshot = await adminService.logs.getLogs(nextFilters)
      setLogs(mergeLogBuffer(snapshot))
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load server logs"
      setError(message)
      showToast({
        title: "Error",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    if (!isCurrentUserAdmin) {
      setIsLoading(false)
      setError("Access denied. Admin privileges required.")
      return
    }

    loadSnapshot(filters)
  }, [filters, isCurrentUserAdmin, loadSnapshot])

  useEffect(() => {
    if (!isCurrentUserAdmin || isPaused) {
      setIsStreaming(false)
      return
    }

    const controller = new AbortController()
    setIsStreaming(true)

    void adminService.logs.streamLogs(filters, {
      signal: controller.signal,
      onEntry: (entry) => {
        setLogs((current) => mergeLogBuffer([...current, entry]))
      },
      onError: (streamError) => {
        setError(streamError.message)
      },
    }).catch((streamError) => {
      const message = streamError instanceof Error ? streamError.message : "Log stream stopped"
      setError(message)
      showToast({
        title: "Stream error",
        description: message,
        variant: "destructive",
      })
    }).finally(() => {
      setIsStreaming(false)
    })

    return () => {
      controller.abort()
    }
  }, [filters, isCurrentUserAdmin, isPaused, showToast])

  useEffect(() => {
    if (!logContainerRef.current || isPaused) {
      return
    }

    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
  }, [logs, isPaused])

  const applyFilters = () => {
    setFilters({
      tail: Math.min(Math.max(Number(draftFilters.tail) || DEFAULT_FILTERS.tail, 1), 500),
      level: draftFilters.level || "",
      module: draftFilters.module.trim(),
    })
  }

  const levelOptions = useMemo(() => [
    { value: "", label: "All levels" },
    { value: "trace", label: "Trace" },
    { value: "debug", label: "Debug" },
    { value: "info", label: "Info" },
    { value: "warn", label: "Warn" },
    { value: "error", label: "Error" },
    { value: "fatal", label: "Fatal" },
  ], [])

  if (!isCurrentUserAdmin) {
    return (
      <div className="text-center space-y-4">
        <div className="text-destructive">Access denied. Admin privileges required.</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Server Logs"
        description="Live tail for the unified canvas-server logger"
        actions={
        <div className="flex items-center gap-2 text-sm">
          <Activity className={`w-4 h-4 ${isStreaming ? "text-success" : "text-muted-foreground"}`} />
          <span className="text-muted-foreground">
            {isPaused ? "Paused" : isStreaming ? "Streaming" : "Disconnected"}
          </span>
        </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-[140px_180px_1fr_auto]">
        <div>
          <Label htmlFor="tail">Tail</Label>
          <Input
            id="tail"
            type="number"
            min={1}
            max={500}
            value={draftFilters.tail}
            onChange={(event) => setDraftFilters((current) => ({ ...current, tail: Number(event.target.value) }))}
          />
        </div>

        <div>
          <Label htmlFor="level">Level</Label>
          <select
            id="level"
            className="w-full px-3 py-2 border rounded-md bg-background"
            value={draftFilters.level}
            onChange={(event) => setDraftFilters((current) => ({ ...current, level: event.target.value }))}
          >
            {levelOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="module">Module filter</Label>
          <Input
            id="module"
            placeholder="auth, http, workspace..."
            value={draftFilters.module}
            onChange={(event) => setDraftFilters((current) => ({ ...current, module: event.target.value }))}
          />
        </div>

        <div className="flex items-end">
          <Button onClick={applyFilters} className="w-full">
            Apply
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={() => setIsPaused((current) => !current)}
        >
          {isPaused ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
          {isPaused ? "Resume" : "Pause"}
        </Button>

        <Button
          variant="outline"
          onClick={() => loadSnapshot(filters)}
        >
          <RotateCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>

        <Button
          variant="outline"
          onClick={() => setLogs([])}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Clear buffer
        </Button>

        <span className="text-sm text-muted-foreground ml-auto">
          Showing {logs.length} lines
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <div
          ref={logContainerRef}
          data-scheme="dark"
          className="bg-background text-success font-mono text-xs h-viewport-pane overflow-auto p-4 rounded-md"
        >
          {isLoading ? (
            <div className="text-muted-foreground">Loading logs...</div>
          ) : logs.length === 0 ? (
            <div className="text-muted-foreground">No logs available</div>
          ) : (
            <div className="whitespace-pre-wrap break-words">
              {logs.map((entry, index) => (
                <div
                  key={`${entry.time || "log"}-${index}`}
                  className={getLogLineColor(entry)}
                >
                  {entry.line}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
