import * as React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { AuthLayout } from "@/components/auth/auth-layout"
import { completeGoogleLogin } from "@/services/auth"

// Landing page of "Sign in with Google": the server redirects here with a
// one-time ?code (swapped for a JWT over XHR) or an ?error to show.
export default function GoogleCallbackPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = React.useState<string | null>(params.get('error'))
  const started = React.useRef(false)

  React.useEffect(() => {
    const code = params.get('code')
    if (!code || started.current) return
    started.current = true
    completeGoogleLogin(code)
      .then(() => navigate('/home', { replace: true }))
      .catch((err) => setError(err instanceof Error ? err.message : 'Google sign-in failed'))
  }, [params, navigate])

  return (
    <AuthLayout>
      <div className="flex flex-col space-y-4 text-center">
        {error ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Google sign-in failed</h1>
            <p className="text-sm text-destructive">{error}</p>
            <Button type="button" variant="outline" onClick={() => navigate('/login', { replace: true })}>Back to sign in</Button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Signing you in…</h1>
            <p className="text-sm text-muted-foreground">Completing Google sign-in.</p>
          </>
        )}
      </div>
    </AuthLayout>
  )
}
