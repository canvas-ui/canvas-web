import { api } from '@/lib/api'
import { API_ROUTES } from '@/config/api'

export interface MessageAccount { driver: 'imap' | 'slack' | 'whatsapp'; address: string; canSend: boolean; from?: string; allowAgentSend: boolean }
export interface MessageSend {
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
