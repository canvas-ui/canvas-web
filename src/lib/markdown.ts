import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

// Read-only markdown → HTML. The editor round-trips through tiptap (a
// ProseMirror schema, so anything it has no node for — tables above all — is
// flattened into a run of text); rendering for *display* goes through
// markdown-it instead, which understands the full CommonMark + GFM-table
// surface and costs no ProseMirror bundle.
const md = new MarkdownIt({
  html: false, // raw HTML never reaches the DOM; sanitize below is belt-and-braces
  linkify: true,
  breaks: false,
  typographer: false,
})

// External links open in a new tab and never hand the opener over.
md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  const href = String(tokens[idx].attrGet('href') ?? '')
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('/')) {
    tokens[idx].attrSet('target', '_blank')
    tokens[idx].attrSet('rel', 'noopener noreferrer')
  }
  return self.renderToken(tokens, idx, options)
}

// GFM task lists: `- [ ] item` / `- [x] item`. markdown-it core leaves the
// brackets as literal text, so swap the leading marker for a disabled checkbox.
md.core.ruler.after('inline', 'task-lists', (state) => {
  const tokens = state.tokens
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'inline') continue
    const prev = tokens[i - 1]
    const item = tokens[i - 2]
    if (!prev || prev.type !== 'paragraph_open' || !item || item.type !== 'list_item_open') continue
    const match = /^\[([ xX])\]\s+/.exec(tokens[i].content)
    if (!match) continue
    tokens[i].content = tokens[i].content.slice(match[0].length)
    const children = tokens[i].children
    if (children && children[0]?.type === 'text') {
      children[0].content = children[0].content.replace(/^\[[ xX]\]\s+/, '')
      const box = new state.Token('html_inline', '', 0)
      box.content = `<input type="checkbox" disabled${match[1] === ' ' ? '' : ' checked'}> `
      children.unshift(box)
    }
    item.attrJoin('class', 'task-list-item')
    // Hide the paragraph wrapper so the checkbox sits on the item's own line.
    prev.hidden = true
    const close = tokens[i + 1]
    if (close && close.type === 'paragraph_close') close.hidden = true
  }
  return true
})

export function renderMarkdown(source: string): string {
  const html = md.render(source ?? '')
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
}
