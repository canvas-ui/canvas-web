import { useEffect, useMemo, useState } from 'react'
import { Edit3, Infinity, Plus, Settings, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAgentSessions } from '@/components/agent/agent-session-context'
import { M2Header } from '@/components/menu/shared/M2Header'
import { useMenu } from '@/components/shell/menu-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast-container'
import { getAgent, type Agent, type AgentSessionMutationResult, type AgentSessionSummary } from '@/services/agent'

function formatSessionTitle(session: AgentSessionSummary) {
  if (session.name?.trim()) return session.name.trim()
  if (session.firstMessage?.trim()) return session.firstMessage.trim()
  return session.isExperimental ? 'Experimental' : session.id.slice(0, 8)
}

function formatSessionSubtitle(session: AgentSessionSummary) {
  const updated = new Date(session.updatedAt).toLocaleString()
  if (session.messageCount > 0) {
    return `${session.messageCount} msg${session.messageCount === 1 ? '' : 's'} • ${updated}`
  }
  return `Empty • ${updated}`
}

function findResultSession(result: AgentSessionMutationResult) {
  return result.sessions.sessions.find((session) => (
    session.id === result.current.sessionId
    || session.path === result.current.sessionFile
    || session.id === result.sessions.currentSessionId
    || session.path === result.sessions.currentSessionPath
    || session.isCurrent
  )) || null
}

export function AgentM2Sessions() {
  const { state, closeM2 } = useMenu()
  const agentId = state.selectedEntityId || ''
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [newSessionName, setNewSessionName] = useState('')
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const { current, sessions, isLoading, error, refresh, create, select, rename, remove } = useAgentSessions(agentId)

  useEffect(() => {
    if (!agentId) return

    getAgent(agentId).then(setAgent).catch(() => {})
    refresh().catch((loadError) => {
      showToast({
        title: 'Error',
        description: loadError instanceof Error ? loadError.message : 'Failed to load sessions',
        variant: 'destructive',
      })
    })
  }, [agentId, refresh, showToast])

  const selectedSession = useMemo(() => {
    if (!sessions?.sessions) return null
    if (sessions.currentSessionId) {
      return sessions.sessions.find((session) => session.id === sessions.currentSessionId) || null
    }
    if (sessions.currentSessionPath) {
      return sessions.sessions.find((session) => session.path === sessions.currentSessionPath) || null
    }
    return sessions.sessions.find((session) => session.isCurrent) || null
  }, [sessions])

  const routeAgentId = agent?.name || agentId
  const getRouteSessionId = (session?: AgentSessionSummary | null) => session?.slug || session?.id
  const openChat = (session?: AgentSessionSummary | string | null) => {
    const sessionId = typeof session === 'string' ? session : getRouteSessionId(session)
    navigate(sessionId
      ? `/agents/${encodeURIComponent(routeAgentId)}/${encodeURIComponent(sessionId)}`
      : `/agents/${encodeURIComponent(routeAgentId)}`)
  }

  const handleCreateNew = async () => {
    try {
      const result = await create({ mode: 'persistent', name: newSessionName.trim() || undefined })
      setCreatingNew(false)
      setNewSessionName('')
      openChat(findResultSession(result))
    } catch (createError) {
      showToast({
        title: 'Error',
        description: createError instanceof Error ? createError.message : 'Failed to create session',
        variant: 'destructive',
      })
    }
  }

  const handleExperimental = async () => {
    try {
      const result = await create({ mode: 'experimental' })
      openChat(findResultSession(result))
    } catch (createError) {
      showToast({
        title: 'Error',
        description: createError instanceof Error ? createError.message : 'Failed to open experimental session',
        variant: 'destructive',
      })
    }
  }

  const handleIncognito = async () => {
    try {
      await create({ mode: 'incognito' })
      openChat()
    } catch (createError) {
      showToast({
        title: 'Error',
        description: createError instanceof Error ? createError.message : 'Failed to open incognito session',
        variant: 'destructive',
      })
    }
  }

  const handleSelect = async (session: AgentSessionSummary) => {
    try {
      if (session.isExperimental) {
        await select({ mode: 'experimental' })
      } else {
        await select({ mode: 'persistent', sessionId: session.id })
      }
      openChat(session)
    } catch (selectError) {
      showToast({
        title: 'Error',
        description: selectError instanceof Error ? selectError.message : 'Failed to select session',
        variant: 'destructive',
      })
    }
  }

  const handleRename = async (session: AgentSessionSummary) => {
    if (!editingName.trim()) return
    try {
      const result = await rename(session.id, editingName.trim())
      const renamedSession = result.sessions.sessions.find((entry) => entry.id === session.id)
      setEditingSessionId(null)
      setEditingName('')
      if (selectedSession?.id === session.id) {
        openChat(renamedSession || session)
      }
    } catch (renameError) {
      showToast({
        title: 'Error',
        description: renameError instanceof Error ? renameError.message : 'Failed to rename session',
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async (session: AgentSessionSummary) => {
    if (session.isExperimental) return
    if (!window.confirm(`Delete session "${formatSessionTitle(session)}"?`)) return

    try {
      await remove(session.id)
      openChat()
    } catch (deleteError) {
      showToast({
        title: 'Error',
        description: deleteError instanceof Error ? deleteError.message : 'Failed to delete session',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <M2Header
        title={agent?.label || agent?.name || agentId}
        onBack={closeM2}
        action={
          <button
            type="button"
            onClick={() => navigate(`/agents/${encodeURIComponent(routeAgentId)}/settings`)}
            className="flex h-8 w-8 items-center justify-center rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Agent settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        }
      />

      <div className="border-b border-border px-4 py-3">
        <div className="text-sm font-semibold">Sessions</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {sessions?.mode === 'incognito' ? 'Incognito mode' : sessions?.mode === 'experimental' ? 'Experimental mode' : 'Persistent history'}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={creatingNew ? 'default' : 'outline'}
            onClick={() => {
              setCreatingNew((prev) => !prev)
              setNewSessionName('')
            }}
            disabled={isLoading}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            New
          </Button>
          <Button size="sm" variant={sessions?.mode === 'experimental' ? 'default' : 'outline'} onClick={handleExperimental} disabled={isLoading}>
            <Infinity className="mr-1 h-3.5 w-3.5" />
            Experimental
          </Button>
          <Button size="sm" variant={sessions?.mode === 'incognito' ? 'default' : 'outline'} onClick={handleIncognito} disabled={isLoading}>
            Incognito
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {error && <div className="px-2 py-2 text-xs text-destructive">{error}</div>}

        {creatingNew && (
          <div className="mb-2 rounded-md border bg-muted/20 p-2">
            <div className="mb-2 text-xs text-muted-foreground">Name the new session or leave it blank.</div>
            <div className="flex gap-2">
              <Input
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleCreateNew()
                  }
                  if (e.key === 'Escape') {
                    setCreatingNew(false)
                    setNewSessionName('')
                  }
                }}
                placeholder="Debugging auth"
                className="h-8"
              />
              <Button size="sm" onClick={handleCreateNew} disabled={isLoading}>Create</Button>
            </div>
          </div>
        )}

        {sessions?.sessions.length ? (
          <div className="space-y-1.5">
            {sessions.sessions.map((session) => {
              const isSelected = selectedSession?.id === session.id && sessions.mode !== 'incognito'
              const isEditing = editingSessionId === session.id
              return (
                <div
                  key={session.id}
                  onClick={() => handleSelect(session)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleSelect(session)
                    }
                  }}
                  role="button"
                  tabIndex={isLoading ? -1 : 0}
                  className={`group w-full rounded-md border px-3 py-2 text-left transition-colors ${
                    isSelected ? 'border-foreground bg-accent' : 'border-transparent hover:bg-accent/50'
                  } ${isLoading ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                handleRename(session)
                              }
                              if (e.key === 'Escape') {
                                setEditingSessionId(null)
                                setEditingName('')
                              }
                            }}
                            placeholder="Session name"
                            className="h-8"
                          />
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRename(session)
                            }}
                            disabled={!editingName.trim() || isLoading}
                          >
                            Save
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{formatSessionTitle(session)}</span>
                            {session.isExperimental && (
                              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">∞</span>
                            )}
                            {session.isCurrent && (
                              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Current</span>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">{formatSessionSubtitle(session)}</div>
                        </>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingSessionId(session.id)
                          setEditingName(session.name || formatSessionTitle(session))
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted-foreground/10 text-muted-foreground touch-target"
                        title="Rename"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      {!session.isExperimental && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(session)
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive touch-target"
                          title="Delete session"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-muted-foreground">
            <div>
              <div className="text-sm">{isLoading ? 'Loading sessions...' : 'No persistent sessions yet.'}</div>
              <div className="mt-1 text-xs">Use `New`, `Experimental`, or `Incognito`.</div>
            </div>
          </div>
        )}

        {current?.mode === 'incognito' && (
          <div className="mt-3 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            Incognito session is active. It lives in memory and stays out of the session list.
          </div>
        )}
      </div>
    </div>
  )
}
