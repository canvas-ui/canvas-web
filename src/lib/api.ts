import { CanvasApiClient, CanvasError, isNetworkError } from '@augmentd-labs/canvas-api-client'
import { isWorkspaceNotActive, type ResponseEnvelope } from '@augmentd-labs/canvas-protocol'
import { API_URL } from '@/config/api'
import { handleApiError } from './error-handler'
import { reportNetworkFailure, reportNetworkSuccess } from './connectivity'

// JSON transport comes from the shared workspace client on its DEFAULT
// unwrapping semantics: api.get/post/... resolve to the envelope's payload,
// and an error envelope rejects (the client throws for those regardless of
// the flag, which is why `status === 'error'` never needed checking here).
//
// The one exception is `api.*Envelope()`, which returns the whole
// ResponseEnvelope, for the few callers that need a field the payload does not
// carry: `count`/`totalCount` (document lists, lens search) and `message`
// (admin reindex). Everything else uses the plain methods.
//
// Web-only policy stays here: the redirect guard, token-format gate,
// 401 → /login, and the workspace autostart-and-replay. stream() keeps a raw
// fetch path — it needs the untouched Response body.

// Keep track of redirects to prevent loops
let isRedirecting = false;

function getAppName(): string {
  let appName = localStorage.getItem('appName')
  if (!appName) {
    appName = window.location.hostname
    localStorage.setItem('appName', appName)
  }
  return appName
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean
  // Internal: don't try to autostart an offline workspace for this request.
  // Set on the replayed request (so a workspace that refuses to come up can't
  // loop) and on the /start call itself.
  skipWorkspaceAutostart?: boolean
  // Make an authenticated request, but on auth failure (missing/invalid token
  // or a 401) reject WITHOUT redirecting to /login or touching global auth
  // state. For optional/background fetches whose failure must never hijack
  // navigation — e.g. a `.catch()`ed notifications poll on a public page.
  noAuthRedirect?: boolean
  // Resolve to the whole ResponseEnvelope rather than its payload. Needed only
  // where the caller reads `count`/`totalCount`, which the payload does not
  // carry. Prefer the plain (unwrapped) methods everywhere else.
  envelope?: boolean
}

// Centralized "auth failed → bounce to login" side effect. Skipped entirely
// when a caller opts out via noAuthRedirect, so a caught optional request can
// never navigate the user away.
function redirectToLogin(clearToken: boolean): void {
  if (clearToken) localStorage.removeItem('authToken');
  isRedirecting = true;
  if (!window.location.pathname.includes('/login')) {
    window.location.href = '/login';
  }
}

// Get the authorization token from localStorage
function getAuthToken(): string | null {
  return localStorage.getItem('authToken');
}

// Validate that a token is either a valid JWT or API token
function isValidTokenFormat(token: string): boolean {
  if (!token) return false;

  // Check for API token format (starts with canvas-)
  if (token.startsWith('canvas-') && token.length > 10) {
    return true;
  }

  // Basic JWT structure validation
  const jwtRegex = /^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/;
  return jwtRegex.test(token);
}

// Auth gate shared by the JSON and stream paths. Throws (and optionally
// redirects) exactly like the historical fetchWithDefaults preamble.
function ensureAuthReady(skipAuth: boolean, noAuthRedirect: boolean): void {
  if (isRedirecting && !skipAuth && !noAuthRedirect) {
    throw new Error('Authentication required');
  }
  if (skipAuth) return;

  const authToken = getAuthToken();
  if (!authToken) {
    console.warn('Attempting authenticated request without token');
    if (!noAuthRedirect) redirectToLogin(false);
    throw new Error('Authentication required');
  }
  if (!isValidTokenFormat(authToken)) {
    console.warn('Invalid token format detected, clearing');
    if (noAuthRedirect) {
      throw new Error('Invalid authentication token format');
    }
    redirectToLogin(true);
    throw new Error('Invalid authentication token format');
  }
}

function handle401(noAuthRedirect: boolean): never {
  if (!noAuthRedirect && !isRedirecting) {
    console.error('Authentication failed, redirecting to login');
    redirectToLogin(true);
  }
  throw new Error('Authentication required');
}

// --- Shared client ----------------------------------------------------------

// API_ROUTES entries are absolute URLs under API_URL; the client joins
// baseUrl + apiBase + path, so with apiBase '' the paths below are simply the
// endpoint with the API_URL prefix stripped.
function toClientPath(endpoint: string): string {
  if (endpoint.startsWith(API_URL)) return endpoint.slice(API_URL.length);
  if (endpoint.startsWith('http')) {
    throw new Error(`api.* endpoints must live under API_URL (${API_URL}); got ${endpoint}`);
  }
  return endpoint;
}

const webFetch: typeof fetch = (input, init = {}) => {
  console.log(`API Request: ${init.method || 'GET'} ${input}`);
  // Always include credentials for cookie support (historical behavior).
  return fetch(input, { ...init, credentials: 'include' }).then((response) => {
    console.log(`API Response: ${input}`, { status: response.status, ok: response.ok });
    // Connectivity is judged HERE, on the raw response: a service-worker
    // cache fallback is stamped X-Canvas-Offline and must not count as the
    // server being reachable, while any real HTTP response (even a 4xx) does.
    if (response.headers.get('x-canvas-offline') === 'fallback') reportNetworkFailure();
    else reportNetworkSuccess();
    return response;
  }, (err) => {
    reportNetworkFailure();
    throw err;
  });
}

function buildClient(authed: boolean, envelope: boolean): CanvasApiClient {
  return new CanvasApiClient({
    baseUrl: API_URL,
    apiBase: '',
    getToken: authed ? getAuthToken : () => null,
    appName: getAppName(),
    // The web app never had a client-side request timeout; keep it that way.
    timeout: 0,
    // Default (true) everywhere except the explicit envelope opt-in.
    unwrap: !envelope,
    fetch: webFetch,
  });
}

const clients = {
  authed: buildClient(true, false),
  anon: buildClient(false, false),
  authedEnvelope: buildClient(true, true),
  anonEnvelope: buildClient(false, true),
};

function pickClient(skipAuth: boolean, envelope: boolean): CanvasApiClient {
  if (envelope) return skipAuth ? clients.anonEnvelope : clients.authedEnvelope;
  return skipAuth ? clients.anon : clients.authed;
}

// --- Offline workspaces -----------------------------------------------------
// Workspaces stay stopped until something actually reads from them. Any query
// against an offline workspace starts it and is then replayed, so pinned
// canvases and paths resolve without the user first hunting for a Start
// button. Only reads/writes *inside* a workspace wake it — fetching the
// workspace record itself (GET /workspaces/:id, the list) does not.

const workspaceStarts = new Map<string, Promise<void>>();

// The workspace ref of a request that operates inside a workspace, or null.
// Requires a segment after the ref, which is what excludes the plain
// GET /workspaces/:id detail fetch, plus /start and /stop themselves.
function workspaceRefForRequest(endpoint: string): string | null {
  const path = endpoint.startsWith('http')
    ? new URL(endpoint).pathname
    : endpoint.split('?')[0];
  if (path.includes('/admin/')) return null;
  const match = path.match(/\/workspaces\/([^/?#]+)\/([^/?#]+)/);
  if (!match) return null;
  if (match[2] === 'start' || match[2] === 'stop') return null;
  return decodeURIComponent(match[1]);
}

// Concurrent queries against the same sleeping workspace share one /start.
function startWorkspaceForRequest(ref: string): Promise<void> {
  const pending = workspaceStarts.get(ref);
  if (pending) return pending;

  const started = requestJson<void>('POST', `${API_URL}/workspaces/${encodeURIComponent(ref)}/start`, undefined, {
    skipWorkspaceAutostart: true,
  })
    .then(() => {
      // Let the workspace list and any open workspace view repaint their
      // status without polling.
      window.dispatchEvent(new CustomEvent('workspace:autostarted', { detail: { workspace: ref } }));
      window.dispatchEvent(new CustomEvent('workspaces:refresh'));
    })
    .finally(() => { workspaceStarts.delete(ref); });

  workspaceStarts.set(ref, started);
  return started;
}

async function requestJson<T>(
  method: string,
  endpoint: string,
  data: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const { skipAuth = false, noAuthRedirect = false, skipWorkspaceAutostart = false, envelope = false, headers, signal, body } = options;

  ensureAuthReady(skipAuth, noAuthRedirect);

  const client = pickClient(skipAuth, envelope);
  try {
    const out = await client.request(method, toClientPath(endpoint), {
      data: data !== undefined ? data : body ?? undefined,
      headers: headers as Record<string, string> | undefined,
      signal: signal ?? undefined,
    });
    // Reset redirecting flag on successful response
    isRedirecting = false;
    // 204 / empty bodies resolved to null in the client; callers expect undefined.
    return (out === null ? undefined : out) as T;
  } catch (error) {
    if (error instanceof CanvasError) {
      if (error.statusCode === 401 && !skipAuth) {
        handle401(noAuthRedirect);
      }

      // The workspace this query targets is asleep: start it and replay.
      // (The message fallback inside isWorkspaceNotActive covers servers
      // older than the WORKSPACE_NOT_ACTIVE code normalization.)
      if (!skipWorkspaceAutostart && isWorkspaceNotActive(error)) {
        const ref = workspaceRefForRequest(endpoint);
        if (ref) {
          const ok = await startWorkspaceForRequest(ref).then(() => true, () => false);
          if (ok) {
            return requestJson<T>(method, endpoint, data, { ...options, skipWorkspaceAutostart: true });
          }
        }
      }

      if (isNetworkError(error) || /fetch failed|failed to fetch/i.test(error.message)) {
        // No HTTP response at all: offline, server down, or (rarely) CORS.
        // Deliberately NOT routed through handleApiError — offline, every
        // uncached call fails identically and a toast per request swamps the
        // user. The connectivity module coalesces this into one transition
        // that App.tsx reports once. Callers still get a rejection.
        console.warn(`API: network failure for ${method} ${endpoint}`);
        throw new Error('Network error: server unreachable. Check your connection and try again.');
      }
    }

    console.error(`API Error: ${endpoint}`, error);
    if (error instanceof Error) {
      handleApiError(error, `${method} ${endpoint}`);
    }
    throw error;
  }
}

// Helper methods for common HTTP methods
export const api = {
  async get<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    return requestJson<T>('GET', endpoint, undefined, options);
  },

  async post<T>(endpoint: string, data?: unknown, options: RequestOptions = {}): Promise<T> {
    return requestJson<T>('POST', endpoint, data, options);
  },

  async put<T>(endpoint: string, data?: unknown, options: RequestOptions = {}): Promise<T> {
    return requestJson<T>('PUT', endpoint, data, options);
  },

  async patch<T>(endpoint: string, data?: unknown, options: RequestOptions = {}): Promise<T> {
    return requestJson<T>('PATCH', endpoint, data, options);
  },

  async delete<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    return requestJson<T>('DELETE', endpoint, undefined, options);
  },

  // --- Envelope variants ----------------------------------------------------
  // Only for callers that need `count`/`totalCount`, which live on the
  // envelope rather than in the payload. Everything else uses the plain
  // methods above and gets the payload directly.

  async getEnvelope<T>(endpoint: string, options: RequestOptions = {}): Promise<ResponseEnvelope<T>> {
    return requestJson<ResponseEnvelope<T>>('GET', endpoint, undefined, { ...options, envelope: true });
  },

  async postEnvelope<T>(endpoint: string, data?: unknown, options: RequestOptions = {}): Promise<ResponseEnvelope<T>> {
    return requestJson<ResponseEnvelope<T>>('POST', endpoint, data, { ...options, envelope: true });
  },

  // Helper function to set auth token after login
  setAuthToken(token: string): void {
    if (!token) {
      console.warn('Attempted to set empty auth token');
      return;
    }

    // Validate token before setting
    if (!isValidTokenFormat(token)) {
      console.error('Attempted to set invalid token format:', token.substring(0, 10) + '...');
      return;
    }

    localStorage.setItem('authToken', token);
    console.log('Auth token set successfully');

    // Reset redirect flag when setting a new token
    isRedirecting = false;
  },

  // Helper function to clear auth token on logout
  clearAuthToken(): void {
    localStorage.removeItem('authToken');
    console.log('Auth token cleared');
  },

  // Check if user is authenticated
  isAuthenticated(): boolean {
    const token = getAuthToken();
    return !!token && isValidTokenFormat(token);
  },

  // Streaming API method for real-time data. Needs the raw Response body, so
  // it stays on plain fetch — with the same auth gate, headers, credentials,
  // 401 handling and workspace autostart as the JSON path.
  async stream(
    endpoint: string,
    data?: unknown,
    options: {
      onOpen?: () => void;
      onChunk?: (chunk: string) => void;
      onError?: (error: Error) => void;
      onComplete?: () => void;
      signal?: AbortSignal;
      // Internal: set on the replayed request after a workspace autostart.
      skipWorkspaceAutostart?: boolean;
    } = {}
  ): Promise<void> {
    const { onOpen, onChunk, onError, onComplete, signal, skipWorkspaceAutostart = false } = options;

    try {
      ensureAuthReady(false, false);
      const authToken = getAuthToken();

      let bodyContent: RequestInit['body'];
      const headers: Record<string, string> = {
        'X-App-Name': getAppName(),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      };

      if (data !== undefined) {
        if (typeof data === 'object' && data !== null && !(data instanceof FormData) && !(data instanceof URLSearchParams) && !(data instanceof Blob)) {
          bodyContent = JSON.stringify(data);
          headers['Content-Type'] = 'application/json';
        } else {
          bodyContent = data as BodyInit;
        }
      }

      const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: bodyContent,
        signal,
      });

      if (!response.ok) {
        if (response.status === 401) {
          handle401(false);
        }

        let errorData: { message?: string; error?: string; code?: string } | null = null;
        try {
          errorData = await response.json();
        } catch {
          // Non-JSON error body; fall back to the status text below.
        }
        const errorMessage = errorData?.message || errorData?.error || response.statusText || 'Request failed';

        // The workspace this stream targets is asleep: start it and replay.
        if (!skipWorkspaceAutostart && isWorkspaceNotActive({ code: errorData?.code, message: errorMessage })) {
          const ref = workspaceRefForRequest(endpoint);
          if (ref) {
            const ok = await startWorkspaceForRequest(ref).then(() => true, () => false);
            if (ok) {
              return api.stream(endpoint, data, { ...options, skipWorkspaceAutostart: true });
            }
          }
        }

        throw new Error(`HTTP ${response.status}: ${errorMessage}`);
      }

      isRedirecting = false;
      onOpen?.();

      // Check if the response body exists and supports streaming
      if (!response.body) {
        throw new Error('Response body is null - streaming not supported');
      }

      // Check if getReader is available on the response body
      if (typeof response.body.getReader !== 'function') {
        // Fallback: try to read the entire response as text
        console.warn('ReadableStream.getReader not available, falling back to text response');
        const text = await response.text();
        if (onChunk) {
          onChunk(text);
        }
        if (onComplete) {
          onComplete();
        }
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          // Check for abort signal
          if (signal?.aborted) {
            reader.cancel();
            throw new Error('Stream aborted');
          }

          const { done, value } = await reader.read();

          if (done) {
            if (onComplete) {
              onComplete();
            }
            break;
          }

          // Decode the chunk and process it
          const chunk = decoder.decode(value, { stream: true });
          if (chunk && onChunk) {
            onChunk(chunk);
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error('Streaming error:', error);
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    }
  }
}
