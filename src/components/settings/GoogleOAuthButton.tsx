import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { getGoogleRedirectUri, linkGoogleAccount, type GoogleOAuthScope } from '@/services/oauth'

// "Sign in with Google" for forms that need an offline-access refresh token.
// Needs the OAuth client id + secret already typed in; runs the consent popup
// and hands the refresh token (and account e-mail) back to the form. Also
// shows the redirect URI the user has to register on the OAuth client — the
// step every first-time setup trips over.
export function GoogleOAuthButton({ clientId, clientSecret, scope, onLinked, disabled }: {
  clientId: string
  clientSecret: string
  scope: GoogleOAuthScope
  onLinked: (result: { refreshToken: string; account: string | null }) => void
  disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [redirectUri, setRedirectUri] = useState<string | null>(null)
  const { showToast } = useToast()
  const ready = clientId.trim().length > 0 && clientSecret.trim().length > 0

  useEffect(() => {
    let cancelled = false
    getGoogleRedirectUri().then((uri) => { if (!cancelled) setRedirectUri(uri) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const run = async () => {
    setBusy(true)
    try {
      const result = await linkGoogleAccount({ clientId: clientId.trim(), clientSecret: clientSecret.trim(), scope })
      onLinked(result)
      showToast({ title: 'Google account linked', description: result.account ? `Refresh token obtained for ${result.account}` : 'Refresh token obtained' })
    } catch (err) {
      showToast({ title: 'Google sign-in failed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" size="sm" disabled={disabled || busy || !ready} onClick={() => { void run() }}
        title={ready ? 'Open the Google consent screen and fill in the refresh token' : 'Enter the OAuth client id and secret first'}>
        <Icon icon="mdi:google" width={14} height={14} className="mr-2" />
        {busy ? 'Waiting for Google…' : 'Sign in with Google to get a refresh token'}
      </Button>
      {redirectUri && (
        <p className="text-[11px] text-muted-foreground/80 break-all">
          Register this redirect URI on the OAuth client (Google Cloud Console → Credentials → your Web application client → Authorized redirect URIs):{' '}
          <code className="select-all">{redirectUri}</code>
        </p>
      )}
    </div>
  )
}
