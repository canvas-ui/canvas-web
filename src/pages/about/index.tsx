import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/common/page-header'
import { useSettingsMenuBack } from '@/components/common/use-settings-back'
import { api } from '@/lib/api'

/**
 * Settings > About — every component version in one place: this web UI
 * (build-time constant), the server it talks to, and the canvas-* packages
 * installed on that server (reported by `GET /rest/v2/ping`).
 */

interface AboutInfo {
  appName?: string
  productName?: string
  version?: string
  license?: string
  sourceUrl?: string
  commit?: string
  components?: Record<string, string>
  uptime?: number
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function VersionRow({ name, version, detail }: { name: string; version: string; detail?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{name}</div>
        {detail && <div className="text-xs text-muted-foreground truncate">{detail}</div>}
      </div>
      <code className="text-xs text-muted-foreground shrink-0">{version}</code>
    </div>
  )
}

export default function AboutPage() {
  const [info, setInfo] = useState<AboutInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    api
      .get<AboutInfo>('/ping', { skipAuth: true })
      .then((response) => {
        if (isMounted) setInfo(response ?? {})
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : 'Failed to reach the server')
      })
    return () => {
      isMounted = false
    }
  }, [])

  const serverDetail = [
    info?.commit ? `commit ${info.commit.slice(0, 7)}` : null,
    typeof info?.uptime === 'number' ? `up ${formatUptime(info.uptime)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const components = Object.entries(info?.components ?? {}).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        className="mb-6"
        title="About"
        onBack={useSettingsMenuBack()}
        description="Versions of every Canvas component this installation is running."
      />

      <div className="space-y-6">
        <section className="rounded-md border border-border divide-y divide-border">
          <VersionRow name="Canvas Web" detail="this interface" version={`v${__APP_VERSION__}`} />
          {info?.version && (
            <VersionRow
              name={info.productName || info.appName || 'Canvas Server'}
              detail={serverDetail || undefined}
              version={`v${info.version}`}
            />
          )}
        </section>

        {components.length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Server components
            </h2>
            <div className="rounded-md border border-border divide-y divide-border">
              {components.map(([name, version]) => (
                <VersionRow key={name} name={name} version={`v${version}`} />
              ))}
            </div>
          </section>
        )}

        {error && (
          <p className="text-sm text-muted-foreground">
            Server details unavailable: {error}
          </p>
        )}

        {info?.sourceUrl && (
          <p className="text-xs text-muted-foreground">
            {info.license ? `Licensed ${info.license}. ` : ''}
            <a
              href={info.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Get the source code
            </a>
            .
          </p>
        )}
      </div>
    </div>
  )
}
