import { lazy, Suspense } from 'react'

const MarkdownHtml = lazy(() => import('./markdown-html'))

/**
 * THE markdown renderer. Every surface that displays markdown — note bodies,
 * markdown files, todo descriptions, agent replies and their reasoning — goes
 * through this one component, so they share a parser, a sanitizer and a
 * stylesheet (components/common/markdown.css).
 *
 * markdown-it lives in a lazy chunk; until it lands the raw source renders as
 * pre-wrapped text, which is exactly what these surfaces showed before. That
 * keeps streaming chat flicker-free — no spinner, no layout jump.
 */
export function MarkdownView({ content, className = '' }: { content: string; className?: string }) {
  return (
    <Suspense fallback={<div className={`whitespace-pre-wrap break-words ${className}`}>{content}</div>}>
      <MarkdownHtml content={content} className={className} />
    </Suspense>
  )
}

export default MarkdownView
