import MarkdownIt from 'markdown-it'
const markdown = new MarkdownIt({ html: false })
/** Convert editor Markdown into WhatsApp's supported text formatting. */
export function whatsappMarkdown(value: string): string {
  const render = (tokens: ReturnType<typeof markdown.parse>): string => {
    const links: string[] = []
    return tokens.map((token) => {
    if (token.children) return render(token.children)
    switch (token.type) {
      case 'strong_open': case 'strong_close': return '*'
      case 'em_open': case 'em_close': return '_'
      case 's_open': case 's_close': return '~'
      case 'code_inline': return `\`${token.content}\``
      case 'fence': case 'code_block': return `\`\`\`\n${token.content}\`\`\`\n`
      case 'text': return token.content
      case 'softbreak': case 'hardbreak': return '\n'
      case 'paragraph_close': case 'heading_close': return '\n\n'
      case 'list_item_open': return '- '
      case 'link_open': links.push(String(token.attrGet('href') || '')); return ''
      case 'link_close': return ` (${links.pop() || ''})`
      case 'image': return token.content
      default: return ''
    }
    }).join('')
  }
  return render(markdown.parse(value, {})).trim()
}
