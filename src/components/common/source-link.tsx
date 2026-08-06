import { useServerSource } from '@/hooks/useServerSource'

/**
 * The human-readable AGPL section 13 source offer.
 *
 * Section 13 entitles anyone who interacts with this server over a network to
 * the corresponding source of the version they are talking to, so this belongs
 * on every surface a network user can reach without an account: the public
 * share pages above all, and the auth screens.
 *
 * If you deploy a modified Canvas, repoint the server at the repository that
 * publishes your changes (`CANVAS_SOURCE_URL`, and `CANVAS_SOURCE_COMMIT` where
 * the build has no git metadata). Removing this component instead of repointing
 * it does not satisfy the licence.
 */
export function SourceLink({ className = '' }: { className?: string }) {
  const source = useServerSource()

  if (!source) return null

  const build = [source.version ? `v${source.version}` : null, source.commit?.slice(0, 7)]
    .filter(Boolean)
    .join(' ')

  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      Powered by{' '}
      <a
        href={source.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        Canvas
      </a>
      {build ? ` ${build}` : ''}
      {source.license ? `, ${source.license}` : ''}.{' '}
      <a
        href={source.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        Get the source code
      </a>
      .
    </p>
  )
}
