import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { API_ROUTES } from "@/config/api"

interface User {
  id: string
  email: string
  createdAt: string
  updatedAt: string
}

interface Session {
  id: string
  name: string
  initializer: string
  user: User
}

interface ApiResponse {
  status: string
  statusCode: number
  message: string
  payload: Session[]
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    localStorage.getItem('selectedSession')
  )

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await fetch(API_ROUTES.sessions, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        
        if (!response.ok) {
          throw new Error('Failed to fetch sessions')
        }

        const data: ApiResponse = await response.json()
        setSessions(data.payload)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchSessions()
  }, [])

  const handleSelectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId)
    localStorage.setItem('selectedSession', sessionId)
  }

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
        </CardHeader>
        <CardContent>
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
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">{session.name}</h3>
                    <p className="text-sm text-muted-foreground">ID: {session.id}</p>
                    <p className="text-sm text-muted-foreground">
                      Initializer: {session.initializer}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <p className="text-sm text-muted-foreground">
                      User: {session.user.email}
                    </p>
                    {selectedSessionId === session.id ? (
                      <span className="text-green-600 font-small">Active</span>
                    ) : (
                      <button
                        onClick={() => handleSelectSession(session.id)}
                        className="px-4 py-2 rounded-md text-sm bg-secondary hover:bg-secondary/80"
                      >
                        Select
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}