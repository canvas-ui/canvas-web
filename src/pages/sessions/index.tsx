import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { API_ROUTES } from "@/config/api"
import { api } from "@/lib/api"

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    JSON.parse(localStorage.getItem('selectedSession') || '{}').id || null
  )
  const [newSessionName, setNewSessionName] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    fetchSessions()
  }, [])

  const fetchSessions = async () => {
    try {
      const data = await api.get<ApiResponse<Session[]>>(API_ROUTES.sessions)
      setSessions(data.payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sessions')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectSession = (session: Session) => {
    setSelectedSessionId(session.id)
    localStorage.setItem('selectedSession', JSON.stringify({ id: session.id, name: session.name }))
    window.location.href = '/workspaces'
  }

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSessionName.trim()) return

    setIsCreating(true)
    try {
      await api.post(API_ROUTES.sessions, { name: newSessionName })
      await fetchSessions()
      setNewSessionName("")
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="h-full flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Select a Session</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateSession} className="mb-6">
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

          <div className="space-y-4">
            {isLoading && <p className="text-center text-muted-foreground">Loading sessions...</p>}
            
            {error && (
              <div className="text-center text-destructive">
                <p>{error}</p>
              </div>
            )}

            {!isLoading && !error && sessions.length === 0 && (
              <p className="text-center text-muted-foreground">No sessions found</p>
            )}

            {sessions.map((session) => (
              <div 
                key={session.id} 
                className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold">{session.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Created by: {session.user.email}
                    </p>
                  </div>
                  <Button
                    onClick={() => handleSelectSession(session)}
                    variant={selectedSessionId === session.id ? "secondary" : "outline"}
                  >
                    {selectedSessionId === session.id ? "Selected" : "Select"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}