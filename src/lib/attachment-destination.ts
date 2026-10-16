/** Example only: the server expands these tokens using each email's sent date
 * (received/content date, then creation date if absent), in its own timezone. */
export function attachmentDestinationPreview(backend: string, folder: string, subfolder: string, date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const tokens: Record<string, string> = {
    YYYY: String(date.getFullYear()), YY: pad(date.getFullYear() % 100), MM: pad(date.getMonth() + 1), DD: pad(date.getDate()),
    HH: pad(date.getHours()), mm: pad(date.getMinutes()), ss: pad(date.getSeconds()),
  }
  const render = (value: string) => value.replace(/\{\{\s*([A-Za-z]+)\s*\}\}/g, (match, token: string) => tokens[token] ?? match)
  const clean = (value: string) => value.split(/[\\/]+/).filter(segment => segment && segment !== '.' && segment !== '..').join('/')
  const root = [backend, clean(render(folder.trim()))].filter(Boolean).join('/')
  const added = clean(render(subfolder.trim()))
  return { root, added, result: [root, added, '<attachment filename>'].filter(Boolean).join('/'), date: `${tokens.YYYY}-${tokens.MM}-${tokens.DD}` }
}
