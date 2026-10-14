import type { Document } from '../types/workspace'
import type { HookRule } from '../services/hooks'

export interface DocumentRulePreset { id: string; label: string; rule: HookRule }

const text = (value: unknown): string => typeof value === 'string' ? value : ''
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t')

/** Drafts only: choosing a preset never saves or runs a rule. */
export function documentRulePresets(document: Document): DocumentRulePreset[] {
  const data = document.data || {}
  const email = document.schema === 'data/schema/message/email'
  const message = !email && document.schema.startsWith('data/schema/message')
  const platform = text(data.platform)
  const channel = text(object(data.channel).id) || text(data.channel)
  const presets: DocumentRulePreset[] = []
  const add = (id: string, label: string, conditions: Record<string, unknown>) => presets.push({
    id, label,
    rule: {
      id: '', description: label, enabled: true,
      when: { event: 'document.inserted', schema: document.schema, ...conditions },
      then: [{ action: 'link', paths: [] }],
    },
  })
  const scope = platform ? { platform: { equals: platform } } : {}
  if (email) {
    const from = text(object(data.from).address) || text(data.from)
    if (from) add('sender', `Mail from ${from}`, { from: { equals: from } })
    if (data.subject) add('subject', 'Subject matches regex', { subject: { regex: escapeRegex(data.subject) } })
  } else if (message) {
    const sender = text(object(data.sender).id) || text(object(data.sender).username) || text(object(data.sender).name) || text(data.sender)
    const senderName = text(object(data.sender).name) || text(object(data.sender).username) || sender
    if (sender) add('sender', `Messages from ${senderName}`, { ...scope, sender: { equals: sender } })
  }
  const body = text(data.body) || text(data.text) || text(data.content) || text(data.bodyHtml) || text(data.bodyPreview)
  // A short literal excerpt is a useful starting expression; it stays editable.
  if (email || message || body) add('body', email ? 'Email body matches regex' : 'Text matches regex', { ...scope, body: { regex: escapeRegex(body.slice(0, 160)) } })
  if (message) {
    const thread = text(data.threadId) || (['slack', 'teams'].includes(platform) ? text(object(document.metadata).remoteId) : '')
    if (thread && channel) add('thread', 'Messages in this thread', { ...scope, channel: { equals: channel }, thread: { equals: thread } })
    if (channel) add('channel', platform === 'whatsapp' ? 'Messages in this conversation' : 'Messages in this channel', { ...scope, channel: { equals: channel } })
  }
  if (data.url) add('url', 'URL matches regex', { url: { regex: escapeRegex(data.url) } })
  add('schema', 'All items of this type', {})
  return presets
}
