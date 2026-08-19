import { Mail, Phone, MessageSquare, Globe, Link as LinkIcon, Building2, Fingerprint, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RendererProps } from './types'

// Channel kinds we have a glyph for; anything else (the schema lets a connector
// invent one) falls back to the generic message icon rather than being hidden.
const CHANNEL_ICON: Record<string, typeof Mail> = {
  email: Mail,
  phone: Phone,
  sms: MessageSquare,
  chat: MessageSquare,
  slack: MessageSquare,
  matrix: MessageSquare,
  web: Globe,
  url: Globe,
}

const TYPE_LABEL: Record<string, string> = {
  person: 'Person',
  organization: 'Organization',
  service: 'Service',
  bot: 'Bot',
}

interface Identifier { type?: string; provider?: string; identifier?: string; label?: string; primary?: boolean }
interface Channel { kind?: string; value?: string; label?: string; platform?: string; primary?: boolean }
interface Organization { name?: string; role?: string }
interface ResourceLink { type?: string; target?: string; subject?: string }

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : [])

// A channel value that a browser can act on: mail/tel links open the right app,
// http(s) opens the page. Anything else stays plain text — a Slack member id is
// not a URL and linkifying it would produce a dead link.
function channelHref(kind: string, value: string): string | null {
  if (!value) return null
  if (kind === 'email') return `mailto:${value}`
  if (kind === 'phone' || kind === 'sms') return `tel:${value.replace(/[^\d+]/g, '')}`
  if (/^https?:\/\//i.test(value)) return value
  return null
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({ icon: Icon, primary, children, title }: {
  icon: typeof Mail
  primary?: boolean
  children: React.ReactNode
  title?: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm" title={title}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 truncate">{children}</div>
      {/* The schema allows exactly one primary per channel kind, so this is a
          statement about which address actually reaches them. */}
      {primary && <Star className="h-3 w-3 shrink-0 fill-current text-data-5" aria-label="Primary" />}
    </div>
  )
}

/**
 * Read view for `data/schema/identity` — a person, organization, service or bot
 * and the addresses that reach them.
 *
 * An Identity HAS identifiers, it is not a list of them (see the schema's own
 * note): the display name leads, and the identifier/channel arrays are the
 * evidence underneath. That distinction is what lets the extraction work later
 * fold "jane@acme.com" and "@jane" into one person.
 */
export function IdentityRenderer({ document, className }: RendererProps) {
  const data = document.data ?? {}
  const identifiers = asArray<Identifier>(data.identifiers)
  const channels = asArray<Channel>(data.channels)
  const organizations = asArray<Organization>(data.organizations)
  const links = asArray<ResourceLink>(data.links)
  const tags = asArray<string>(data.tags)

  const displayName = String(data.displayName || '').trim()
  const type = String(data.type || '').trim()
  const primaryEmail = String(data.primaryEmail || '').trim()
  const name = (data.name && typeof data.name === 'object' ? data.name : {}) as Record<string, unknown>
  const fullName = [name.prefix, name.given, name.middle, name.family, name.suffix]
    .map((p) => String(p || '').trim()).filter(Boolean).join(' ')

  // `primaryEmail` is also expected to appear as a primary email channel (the
  // schema's setter keeps both in step). Don't print it twice when it does.
  const emailInChannels = channels.some((c) => c.kind === 'email' && c.value === primaryEmail)

  return (
    <div className={cn('space-y-4', className)}>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{displayName || `Identity ${document.id}`}</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {type && <span className="rounded-full bg-muted px-2 py-0.5">{TYPE_LABEL[type] || type}</span>}
          {fullName && fullName !== displayName && <span>{fullName}</span>}
          {String(data.timezone || '') && <span>{String(data.timezone)}</span>}
          {String(data.locale || '') && <span>{String(data.locale)}</span>}
        </div>
      </div>

      {primaryEmail && !emailInChannels && (
        <Section title="Primary email" count={1}>
          <Row icon={Mail} primary>
            <a href={`mailto:${primaryEmail}`} className="hover:underline">{primaryEmail}</a>
          </Row>
        </Section>
      )}

      <Section title="Channels" count={channels.length}>
        {channels.map((channel, i) => {
          const kind = String(channel.kind || '').toLowerCase()
          const value = String(channel.value || '')
          const href = channelHref(kind, value)
          const Icon = CHANNEL_ICON[kind] || MessageSquare
          return (
            <Row key={`${kind}:${value}:${i}`} icon={Icon} primary={channel.primary} title={channel.platform || kind}>
              {href
                ? <a href={href} className="hover:underline" target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">{value}</a>
                : value}
              {channel.label && <span className="ml-2 text-xs text-muted-foreground">{channel.label}</span>}
            </Row>
          )
        })}
      </Section>

      <Section title="Identifiers" count={identifiers.length}>
        {identifiers.map((identifier, i) => (
          <Row key={`${identifier.type}:${identifier.identifier}:${i}`} icon={Fingerprint} primary={identifier.primary}>
            <span className="font-mono text-xs">{identifier.identifier}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {[identifier.type, identifier.provider].filter(Boolean).join(' · ')}
            </span>
          </Row>
        ))}
      </Section>

      <Section title="Organizations" count={organizations.length}>
        {organizations.map((org, i) => (
          <Row key={`${org.name}:${i}`} icon={Building2}>
            {org.name}
            {org.role && <span className="ml-2 text-xs text-muted-foreground">{org.role}</span>}
          </Row>
        ))}
      </Section>

      <Section title="Links" count={links.length}>
        {links.map((link, i) => (
          <Row key={`${link.type}:${link.target}:${i}`} icon={LinkIcon}>
            <span className="font-mono text-xs">{link.target}</span>
            {link.type && <span className="ml-2 text-xs text-muted-foreground">{link.type}</span>}
          </Row>
        ))}
      </Section>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{tag}</span>
          ))}
        </div>
      )}
    </div>
  )
}
