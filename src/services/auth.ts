import { API_ROUTES } from '@/config/api'
import { api } from '@/lib/api'
import socketService from '@/lib/socket'
import { jwtDecode } from 'jwt-decode'

interface UserProfile {
  id: string;
  email: string;
  userType: string;
  status: string;
  created: string;
  updated: string;
}

interface TokenPayload {
  sub: string;
  email: string;
  userType: string;
  ver?: string;
  exp: number;
}

// Define two possible response structures
interface DirectLoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    userType: string;
  };
}

interface NestedLoginResponse {
  payload: {
    token: string;
    user: {
      id: string;
      email: string;
      userType: string;
    };
  };
}

// Union type for possible login response structures. This is the envelope's
// PAYLOAD — `api.post` already unwrapped it. The nested variant covers servers
// that put a second `payload` object inside the envelope payload.
type LoginResponseData = DirectLoginResponse | NestedLoginResponse;

export async function loginUser(email: string, password: string, strategy: string = 'auto'): Promise<LoginResponseData> {
  try {
    const response = await api.post<LoginResponseData>(API_ROUTES.login, {
      email,
      password,
      strategy,
    }, { skipAuth: true });

    console.log('Login response:', response);

    // Check if the response has the expected structure
    const loginData = response;

    // Handle direct token structure (matches DirectLoginResponse)
    if ('token' in loginData) {
      console.log('Setting auth token (direct):', loginData.token.substring(0, 10) + '...');
      api.setAuthToken(loginData.token);

      // Connect WebSocket after successful login
      socketService.connect(loginData.token);

      // Workspaces are NOT started here. They stay offline until something
      // actually queries them, at which point the API layer starts them and
      // replays the query (see src/lib/api.ts).

      return response;
    }
    // Handle nested payload structure (matches NestedLoginResponse)
    else if (loginData && 'payload' in loginData && loginData.payload && loginData.payload.token) {
      console.log('Setting auth token (nested):', loginData.payload.token.substring(0, 10) + '...');
      api.setAuthToken(loginData.payload.token);

      // Connect WebSocket after successful login
      socketService.connect(loginData.payload.token);

      // Workspaces are NOT started here. They stay offline until something
      // actually queries them, at which point the API layer starts them and
      // replays the query (see src/lib/api.ts).

      return response;
    } else {
      console.error('Invalid login response structure:', response);
      throw new Error('Invalid login response: missing token');
    }
  } catch (error) {
    // Clear any existing token on error
    console.error('Login error:', error);
    api.clearAuthToken();
    throw error;
  }
}

export async function logoutUser(): Promise<void> {
  try {
    // Call logout endpoint
    await api.post(API_ROUTES.logout, {});

    // Disconnect WebSocket
    socketService.disconnect();

    // Clear the token regardless of server response
    api.clearAuthToken();

    console.log('User logged out successfully');
  } catch (error) {
    // Still disconnect and clear token on error
    socketService.disconnect();
    api.clearAuthToken();
    console.error('Logout had issues, but token was cleared:', error);
  } finally {
    // The offline cache is keyed by URL, not by account — an explicit logout
    // must not leave this user's documents readable to the next login on the
    // same browser profile. Fire-and-forget: logout must never block on it.
    void import('@/lib/offline').then(({ clearOfflineCaches }) => clearOfflineCaches()).catch(() => {});
  }
}

export async function registerUser(name: string, email: string, password: string): Promise<unknown> {
  try {
    return await api.post(API_ROUTES.register, {
      name,
      email,
      password
    }, { skipAuth: true });
  } catch (error) {
    console.error('Registration failed:', error);
    throw error;
  }
}

// Offline / server-unreachable failures carry this prefix (lib/api.ts wraps
// them). They are NOT an auth verdict — the token may be perfectly valid.
export function isNetworkAuthError(error: unknown): boolean {
  return error instanceof Error && /^Network error/i.test(error.message);
}

// Can the stored credential plausibly still be valid, judged without the
// server? Used by ProtectedRoute when the auth check fails on network error:
// offline must degrade to "unverified", never to a forced logout.
export function hasPlausibleSession(): boolean {
  const token = localStorage.getItem('authToken');
  if (!token) return false;
  // API tokens carry no client-readable expiry — presence is all we can check.
  if (token.startsWith('canvas-')) return true;
  try {
    return jwtDecode<TokenPayload>(token).exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function getCurrentUserFromToken(): { id: string; email: string; userType: string } | null {
  const token = localStorage.getItem('authToken');
  if (!token) return null;
  // An API token is not a JWT: there is no identity to decode, but it is a
  // valid credential — clearing it here (the old behavior, via the catch
  // below) silently logged out API-token sessions.
  if (token.startsWith('canvas-')) return null;

  try {
    const decoded = jwtDecode<TokenPayload>(token);
    // Check if token is expired
    if (decoded.exp * 1000 < Date.now()) {
      // Token is expired, clear it
      api.clearAuthToken();
      return null;
    }

    return {
      id: decoded.sub,
      email: decoded.email,
      userType: decoded.userType || 'user'
    };
  } catch (error) {
    console.error('Failed to decode token:', error);
    api.clearAuthToken(); // Clear invalid token
    return null;
  }
}

export async function getCurrentUser(): Promise<UserProfile | null> {
  try {
    // If not authenticated, don't make the request
    if (!api.isAuthenticated()) {
      console.log('Not authenticated, skipping getCurrentUser request');
      return null;
    }

    const response = await api.get<UserProfile>(API_ROUTES.me);
    console.log('Current user response:', response);

    // Extract user from the response payload
    if (response && response) {
      // Ensure WebSocket is connected if we have a valid user
      if (!socketService.isConnected()) {
        socketService.reconnect();
      }
      return response;
    } else {
      console.warn('Invalid user profile response structure:', response);
      return null;
    }
  } catch (error) {
    console.error('Failed to get current user:', error);

    // Offline / server unreachable: rethrow so the caller can distinguish
    // "cannot verify right now" from "not authenticated". The old code cleared
    // the token here, which is why every disconnect looked like a forced
    // logout — the 7-day JWT was fine, the client was deleting it.
    if (isNetworkAuthError(error)) {
      throw error;
    }

    // Definitive auth verdicts from the server: clear the credential.
    if (error instanceof Error &&
        (error.message.includes('USER_NOT_FOUND_IN_DATABASE') ||
         error.message.includes('Your session is invalid') ||
         error.message.includes('Authentication required') ||
         error.message.includes('user account no longer exists'))) {
      console.warn('Authentication error detected, clearing token:', error.message);
      api.clearAuthToken();
      socketService.disconnect();
      return null;
    }

    return null;
  }
}

export function isAuthenticated(): boolean {
  return api.isAuthenticated();
}

// Server auth configuration (GET /auth/config)
export interface AuthPasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

export interface AuthImapDomain {
  domain: string;
  name: string;
  requireAppPassword: boolean;
}

export interface AuthConfig {
  allowUserRegistrations?: boolean;
  strategies: {
    local: {
      enabled: boolean;
      requireEmailVerification?: boolean;
      passwordPolicy?: AuthPasswordPolicy;
    };
    imap: {
      enabled: boolean;
      domains: AuthImapDomain[];
    };
  };
}

export async function getAuthConfig(): Promise<AuthConfig> {
  try {
    const response = await api.get<AuthConfig>(API_ROUTES.authConfig, { skipAuth: true });
    return response || (response as unknown as AuthConfig);
  } catch (error) {
    console.error('Failed to get auth config:', error);
    // Return default config if API call fails
    return {
      strategies: {
        local: { enabled: true },
        imap: { enabled: false, domains: [] }
      }
    };
  }
}

export async function requestEmailVerification(email: string): Promise<void> {
  try {
    await api.post(API_ROUTES.verifyEmailRequest, { email }, { skipAuth: true });
  } catch (error) {
    console.error('Failed to request email verification:', error);
    throw error;
  }
}
