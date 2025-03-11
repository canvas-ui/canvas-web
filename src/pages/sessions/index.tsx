import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { API_ROUTES } from "@/config/api"
import { api } from "@/lib/api"
import { useToast } from "@/components/ui/toast-container"
import { Trash } from "lucide-react"
import { useNavigate } from "react-router-dom"

export default function SessionsPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Session[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newSessionName, setNewSessionName] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const { showToast } = useToast()

  // Get selected session from localStorage
  const storedSession = localStorage.getItem('selectedSession')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    storedSession ? JSON.parse(storedSession).id : null
  )

  useEffect(() => {
    fetchSessions()
  }, [])

  const fetchSessions = async () => {
    try {
      setIsLoading(true)
      const data = await api.get<ApiResponse<{ sessions: Session[] }>>(API_ROUTES.sessions, {
        includeSession: false // Don't include session header for this request
      })
      setSessions(data.payload.sessions || [])
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch sessions'
      setError(message)
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectSession = (session: Session) => {
    setSelectedSessionId(session.id)
    localStorage.setItem('selectedSession', JSON.stringify({ id: session.id, name: session.name }))
    showToast({
      title: 'Success',
      description: `Session "${session.name}" selected successfully`
    })

    // Use React Router's navigate
    navigate('/workspaces')
  }

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSessionName.trim()) return

    setIsCreating(true)
    try {
      await api.post(API_ROUTES.sessions, { name: newSessionName }, {
        includeSession: false // Don't include session header for this request
      })
      await fetchSessions()
      setNewSessionName("")
      showToast({
        title: 'Success',
        description: 'Session created successfully'
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create session'
      setError(message)
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleExpireSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to expire this session? This action cannot be undone.')) {
      return
    }

    try {
      await api.delete(`${API_ROUTES.sessions}/${sessionId}`, {
        includeSession: false // Don't include session header for this request
      })

      // If we're expiring the currently selected session, clear it from localStorage
      if (selectedSessionId === sessionId) {
        localStorage.removeItem('selectedSession')
        setSelectedSessionId(null)
      }

      await fetchSessions()
      showToast({
        title: 'Success',
        description: 'Session expired successfully'
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to expire session'
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      })
    }
  }

  return (
    <div className="container mx-auto p-4">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Create New Session</CardTitle>
            <CardDescription>Create a new session to organize your work</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateSession} className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  placeholder="Enter new session name: e.g. 'Work', 'Personal', 'School'"
                  disabled={isCreating}
                />
                <Button type="submit" disabled={isCreating || !newSessionName.trim()}>
                  Create New
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your Sessions</CardTitle>
            <CardDescription>Manage your sessions</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && <p className="text-center text-muted-foreground">Loading sessions...</p>}

            {error && (
              <div className="text-center text-destructive">
                <p>{error}</p>
              </div>
            )}

            {!isLoading && !error && sessions.length === 0 && (
              <p className="text-center text-muted-foreground">No sessions found</p>
            )}

            {sessions.length > 0 && (
              <div className="border rounded-md">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-3 font-medium">Name</th>
                        <th className="text-left p-3 font-medium">Created</th>
                        <th className="text-left p-3 font-medium">Last Active</th>
                        <th className="text-left p-3 font-medium">Status</th>
                        <th className="text-right p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((session) => (
                        <tr key={session.id} className="border-t">
                          <td className="p-3">{session.name}</td>
                          <td className="p-3">{new Date(session.createdAt).toLocaleDateString()}</td>
                          <td className="p-3">{new Date(session.lastActiveAt).toLocaleDateString()}</td>
                          <td className="p-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              session.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {session.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                onClick={() => handleSelectSession(session)}
                                variant={selectedSessionId === session.id ? "secondary" : "outline"}
                                size="sm"
                              >
                                {selectedSessionId === session.id ? "Selected" : "Select"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleExpireSession(session.id)}
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              >
                                <Trash className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
