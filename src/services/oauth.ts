import { api } from '@/lib/api'
import { API_URL } from '@/config/api'

// Google OAuth consent flow for integrations that only need an offline-access
// refresh token (Drive storage backend, Calendar connector). The server builds
// the consent URL (POST /oauth/google/start), the browser opens it in a popup,
// Google redirects to the server's public callback, and the callback page
// hands the refresh token back to this window via postMessage. Nothing is
// stored server-side; the token is submitted with the backend/connector form
// exactly as a hand-pasted one would be.

export type GoogleOAuthScope = 'drive' | 'drive.readonly' | 'calendar' | 'calendar.readonly'

export interface GoogleOAuthResult {
  refreshToken: string
  account: string | null
}

interface OAuthMessage {
  type: 'canvas:oauth'
  provider: 'google'
  ok: boolean
  state: string
  scope: string
  refreshToken: string | null
  account: string | null
  error: string | null
}

export async function getGoogleRedirectUri(): Promise<string> {
  const res = await api.get<{ redirectUri: string }>('/oauth/google/redirect-uri')
  return res.redirectUri
}

// Resolves once the popup reports back; rejects on consent error, on an
// unusable popup (blocked), or when the user closes it without finishing.
export async function linkGoogleAccount(input: { clientId: string; clientSecret: string; scope: GoogleOAuthScope }): Promise<GoogleOAuthResult> {
  // Open the window synchronously on the click so popup blockers allow it,
  // then point it at the consent URL once the server has built one.
  const popup = window.open('about:blank', 'canvas-google-oauth', 'popup=yes,width=540,height=720')
  let started: { url: string; state: string; expiresInMs: number }
  try {
    started = await api.post<{ url: string; state: string; expiresInMs: number }>('/oauth/google/start', input)
  } catch (err) {
    popup?.close()
    throw err
  }
  if (!popup) {
    throw new Error('Popup blocked — allow popups for this site and try again')
  }
  popup.location.href = started.url

  const apiOrigin = new URL(API_URL, window.location.origin).origin
  return new Promise<GoogleOAuthResult>((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMessage)
      window.clearInterval(closedPoll)
      window.clearTimeout(expiry)
      fn()
    }
    const onMessage = (event: MessageEvent<OAuthMessage>) => {
      if (event.origin !== apiOrigin) return
      const data = event.data
      if (!data || data.type !== 'canvas:oauth' || data.provider !== 'google' || data.state !== started.state) return
      if (data.ok && data.refreshToken) finish(() => resolve({ refreshToken: data.refreshToken as string, account: data.account }))
      else finish(() => reject(new Error(data.error || 'Google sign-in failed')))
    }
    window.addEventListener('message', onMessage)
    // The result page closes itself a moment after posting; give its message
    // a beat to arrive before treating a closed popup as abandonment.
    const closedPoll = window.setInterval(() => {
      if (popup.closed) window.setTimeout(() => finish(() => reject(new Error('Sign-in window closed before finishing'))), 500)
    }, 500)
    const expiry = window.setTimeout(() => finish(() => { popup.close(); reject(new Error('Sign-in timed out')) }), started.expiresInMs || 10 * 60 * 1000)
  })
}
