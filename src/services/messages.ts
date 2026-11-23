import type { Document } from '@/types/workspace'
import { api } from '@/lib/api'
import { API_ROUTES } from '@/config/api'

export interface MessageAccount { driver: 'imap' | 'slack' | 'whatsapp'; address: string; canSend: boolean; from?: string; allowAgentSend: boolean }
export interface MessageSend {
  files?: Array<{ documentId: number; attachmentIndex?: number }>
  images?: Array<{ name: string; mimeType: string; base64: string }>
  requestId: string; text: string; driver?: string; address?: string; target?: string;
  replyToDocumentId?: number; replyAll?: boolean; subject?: string; to?: string[]; cc?: string[]; bcc?: string[];
  /** Email only: HTML body; `text` is then its plain-text alternative. */
  html?: string
  /** Email replies: quote the original below the reply (server-built, from the stored message). */
  quote?: boolean
  /** Email only: forward `replyToDocumentId` with its attachments to `to`. */
  forward?: boolean
}
export type ComposeMode = 'reply' | 'replyAll' | 'forward'
export interface MessageReceipt { status: 'accepted' | 'unknown'; requestId: string; docId?: number; message?: string; warnings?: string[]; rejected?: string[] }
const base = (workspace: string) => `${API_ROUTES.workspaces}/${encodeURIComponent(workspace)}/messages`
export const messageAccounts = (workspace: string) => api.get<MessageAccount[]>(`${base(workspace)}/accounts`)
export interface ReplyTarget { driver: string; address: string; target?: string; recipients?: { to: string[]; cc: string[] }; allRecipients?: { to: string[]; cc: string[] } }
export const messageReplyTarget = (workspace: string, id: number) => api.get<ReplyTarget | null>(`${base(workspace)}/reply-target/${id}`)
export const sendMessage = (workspace: string, body: MessageSend) => api.post<MessageReceipt>(`${base(workspace)}/send`, body)
export const messageConnection = (workspace: string, address: string) => api.get<{ state: string; qr: string | null; chats: Array<{ id: string; name: string }> }>(`${base(workspace)}/whatsapp/${encodeURIComponent(address)}/connection`)

export const messageSendStatus = (workspace: string, requestId: string) => api.get<MessageReceipt>(`${base(workspace)}/outbox/${encodeURIComponent(requestId)}`)
export const resetMessageConnection = (workspace: string, address: string) => api.delete(`${base(workspace)}/whatsapp/${encodeURIComponent(address)}/connection`)

export interface MessageThreadResult {
  documentId: number
  documents: Document[]
  parents: Record<string, number[]>
  rootIds: number[]
  truncated: boolean
}
export const getMessageThread = (workspace: string, id: number) => api.get<MessageThreadResult>(`${base(workspace)}/thread/${id}`)

const SENDING_ACCOUNTS_TTL_MS = 60_000
const sendingAccountsCache = new Map<string, { at: number; promise: Promise<MessageAccount[]> }>()

/** Accounts of a workspace that can send right now. Shared briefly: every open action menu asks. */
export function sendingAccounts(workspace: string): Promise<MessageAccount[]> {
  const hit = sendingAccountsCache.get(workspace)
  if (hit && Date.now() - hit.at < SENDING_ACCOUNTS_TTL_MS) return hit.promise
  const promise = messageAccounts(workspace).then((list) => list.filter((account) => account.canSend))
  promise.catch(() => sendingAccountsCache.delete(workspace))
  sendingAccountsCache.set(workspace, { at: Date.now(), promise })
  return promise
}

export const MESSAGE_DRIVER_LABELS: Record<MessageAccount['driver'], string> = { imap: 'E-mail', slack: 'Slack', whatsapp: 'WhatsApp' }
