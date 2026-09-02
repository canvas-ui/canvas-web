import { useMemo } from 'react'
import { renderMarkdown } from '@/lib/markdown'
import './markdown.css'

// The rendering half of MarkdownView, split out so markdown-it lands in its own
// async chunk. Never import this directly — go through MarkdownView, which
// carries the plain-text fallback.
export function MarkdownHtml({ content, className = '' }: { content: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(content || ''), [content])
  return <div className={`markdown-body ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}

export default MarkdownHtml
