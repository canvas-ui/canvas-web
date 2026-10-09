import { api } from '@/lib/api'
import { API_ROUTES } from '@/config/api'

/**
 * Server auth backends (local passwords, IMAP, LDAP) — `<server home>/config/
 * auth.json`, admin-only. Reads are redacted server-side: LDAP bind passwords
 * come back as `bindPasswordSet`. On save, `bindPassword` undefined keeps the
 * stored secret, null clears it, a string replaces it.
 */

export type AuthUserType = 'user' | 'admin'
export type AuthUserStatus = 'active' | 'pending' | 'inactive'

export interface PasswordPolicy {
  minLength: number
  maxLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireNumbers: boolean
  requireSpecialChars: boolean
}

export interface ImapDomainConfig {
  name: string
  host: string
  port: number
  secure: boolean
  startTLS: boolean
  requireAppPassword: boolean
}

export interface LdapServerConfig {
  url: string
  bindDN: string
  bindPasswordSet: boolean
  /** Write-only: undefined = keep stored, null = clear, string = replace. */
  bindPassword?: string | null
  searchBase: string
  searchFilter: string
  attributes: string[]
  groupAttribute: string
  tls: boolean
}

export interface ExternalStrategyDefaults {
  enabled: boolean
  defaultUserType: AuthUserType
  defaultStatus: AuthUserStatus
}

export interface GoogleStrategyConfig extends ExternalStrategyDefaults {
  clientId: string
  clientSecretSet: boolean
  /** Write-only: undefined = keep stored, null = clear, string = replace. */
  clientSecret?: string | null
  /** E-mail domains allowed to sign in; empty = any Google account. */
  allowedDomains: string[]
  /** Create a canvas user on first sign-in; false = only pre-existing users. */
  autoCreateUsers: boolean
  /** Extra SPA origins the login may return to (dev servers); the API origin is always allowed. */
  webOrigins: string[]
}

export interface AuthConfig {
  allowUserRegistrations: boolean
  strategies: {
    local: { enabled: boolean; requireEmailVerification: boolean; passwordPolicy: PasswordPolicy }
    imap: ExternalStrategyDefaults & { domains: Record<string, ImapDomainConfig> }
    ldap: ExternalStrategyDefaults & { servers: Record<string, LdapServerConfig> }
    google: GoogleStrategyConfig
  }
}

export interface AuthConfigResponse {
  configPath: string
  config: AuthConfig
}

export interface AuthTestResult {
  ok: boolean
  message: string
  user?: { dn: string; name: string | null; email: string | null; groups: string[] }
}

export function getAuthConfig(): Promise<AuthConfigResponse> {
  return api.get<AuthConfigResponse>(API_ROUTES.admin.authConfig)
}

export function saveAuthConfig(config: AuthConfig): Promise<AuthConfigResponse> {
  return api.put<AuthConfigResponse>(API_ROUTES.admin.authConfig, config)
}

export function testLdapServer(name: string, server: LdapServerConfig, email?: string): Promise<AuthTestResult> {
  return api.post<AuthTestResult>(`${API_ROUTES.admin.authConfig}/test`, { strategy: 'ldap', name, server, email })
}

export function testImapDomain(domain: ImapDomainConfig, email: string, password: string): Promise<AuthTestResult> {
  return api.post<AuthTestResult>(`${API_ROUTES.admin.authConfig}/test`, { strategy: 'imap', domain, email, password })
}
