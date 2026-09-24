import { useMemo } from 'react'
import { renderMarkdown } from '@/lib/markdown'
import './markdown.css'

// The rendering half of MarkdownView, split out so markdown-it lands in its own
// async chunk. Never import this directly — go through MarkdownView, which
// carries the plain-text fallback.
export function MarkdownHtml({ content, className = '', preview = false }: { content: string; className?: string; preview?: boolean }) {
  const html = useMemo(() => renderMarkdown(content || '', preview), [content, preview])
  return <div className={`markdown-body ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}

export default MarkdownHtml
