import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { Plus, X } from 'lucide-react'
import { useAppletTarget } from './use-applet-target'
import { useTerminalTransport, type TerminalSession, type TerminalTransport, type TerminalRead } from '@/components/terminal/terminal-transport'

function TerminalScreen({ session, transport, report }: { session: TerminalSession; transport: TerminalTransport; report: (error: unknown) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const reportRef = useRef(report)
  useEffect(() => { reportRef.current = report }, [report])
  useEffect(() => {
    if (!host.current) return
    const terminal = new Terminal({ cursorBlink: true, scrollback: 10000, fontSize: 14, fontFamily: 'monospace', theme: { background: '#111418', foreground: '#e4e8ee' }, allowProposedApi: false })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host.current)
    let disposed = false, offset = 0, timer: ReturnType<typeof setTimeout>
    const fail = (error: unknown) => { if (!disposed) reportRef.current(error) }
    const resize = () => {
      if (!host.current || host.current.clientWidth === 0 || host.current.clientHeight === 0) return
      fit.fit()
      void transport.resize(session.id, terminal.cols, terminal.rows).catch(fail)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host.current)
    resize()
    const input = terminal.onData(data => { void transport.write(session.id, data).catch(fail) })
    const binary = terminal.onBinary(data => { void transport.write(session.id, Uint8Array.from(data, char => char.charCodeAt(0))).catch(fail) })
    // Clipboard shortcuts retain terminal conventions. Ctrl+C belongs to the shell.
    terminal.attachCustomKeyEventHandler(event => {
      if (event.type === 'keydown' && event.ctrlKey && event.shiftKey && event.code === 'KeyC') {
        void navigator.clipboard.writeText(terminal.getSelection()).catch(fail)
        return false
      }
      if (event.ctrlKey && !event.shiftKey && ['KeyT', 'KeyN', 'KeyW', 'Tab', 'PageUp', 'PageDown'].includes(event.code)) return false
      return true
    })
    const poll = async () => {
      try {
        let next: TerminalRead
        do {
          next = await transport.read(session.id, offset)
          if (disposed) return
          if (offset < next.start) terminal.reset()
          offset = next.offset
          if (next.data.length) await new Promise<void>(resolve => terminal.write(Uint8Array.from(next.data), resolve))
        } while (next.data.length === 65536 && !disposed)
        if (!next.running) { terminal.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n'); return }
        timer = setTimeout(() => { void poll() }, 50)
      } catch (error) { fail(error) }
    }
    void poll()
    terminal.focus()
    return () => { disposed = true; clearTimeout(timer); observer.disconnect(); input.dispose(); binary.dispose(); terminal.dispose() }
  }, [session.id, transport])
  return <div ref={host} className="min-h-0 flex-1 overflow-hidden p-2" style={{ background: '#111418' }} aria-label="Terminal screen" />
}

export function TerminalApplet() {
  const target = useAppletTarget()
  const transport = useTerminalTransport()
  const scope = target?.mode === 'workspace'
    ? JSON.stringify(['workspace', target.workspaceName, target.treeName, target.treeType, '/' + target.path.split('/').filter(Boolean).join('/')])
    : target?.mode === 'context' ? JSON.stringify(['context', target.contextId]) : ''
  if (!transport) return <div className="p-4 text-sm text-muted-foreground">Local terminals are available in Canvas Desktop.</div>
  if (!scope) return <div className="p-4 text-sm text-muted-foreground">Choose a context to open its terminals.</div>
  return <TerminalSessions key={scope} scope={scope} transport={transport} />
}
function TerminalSessions({ scope, transport }: { scope: string; transport: TerminalTransport }) {
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const selectionKey = `terminal:selected:${scope}`
  const [selected, setSelected] = useState(() => localStorage.getItem(selectionKey) || '')
  const [cwd, setCwd] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const report = (error: unknown) => setError(String(error))
  useEffect(() => {
    let disposed = false
    const refresh = async () => {
      try { const rows = await transport.list(scope); if (!disposed) { setSessions(rows); setLoading(false) } }
      catch (error) { if (!disposed) { report(error); setLoading(false) } }
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, 1000)
    return () => { disposed = true; clearInterval(timer) }
  }, [scope, transport])
  const active = sessions.find(session => session.id === selected) || sessions[0]
  const select = (id: string) => { setSelected(id); localStorage.setItem(selectionKey, id) }
  const add = async () => {
    setBusy(true); setError('')
    try { const session = await transport.create(scope, cwd || undefined); setSessions(old => [...old, session]); select(session.id) }
    catch (error) { report(error) } finally { setBusy(false) }
  }
  const close = async (id: string) => {
    try { await transport.close(id); setSessions(old => old.filter(session => session.id !== id)) } catch (error) { report(error) }
  }
  return <div className="flex h-full min-h-0 flex-col" aria-label="Terminal app">
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b p-1" role="tablist" aria-label="Terminal sessions" onDoubleClick={event => { if (event.target === event.currentTarget) void add() }}>
      {sessions.map((session, index) => <div key={session.id} className="flex shrink-0 items-center rounded border">
        <button role="tab" aria-selected={active?.id === session.id} className="px-3 py-1 text-xs" title={`Started in ${session.cwd}`} onClick={() => select(session.id)}>Terminal {index + 1}{session.running ? '' : ' · exited'}</button>
        <button className="p-1" aria-label={`Close terminal ${index + 1}`} title="End this shell session" onClick={() => void close(session.id)}><X size={13} /></button>
      </div>)}
      <button className="p-2" disabled={busy} aria-label="New terminal session" onClick={() => void add()}><Plus size={16} /></button>
    </div>
    {error && <div className="flex items-center justify-between p-2 text-xs text-destructive" role="alert">{error}<button aria-label="Dismiss terminal error" onClick={() => setError('')}><X size={14} /></button></div>}
    {active ? <TerminalScreen key={active.id} session={active} transport={transport} report={report} /> : <form className="flex flex-1 flex-col items-center justify-center gap-3 p-4" onSubmit={event => { event.preventDefault(); void add() }}>
      <p className="text-sm">{loading ? 'Loading sessions…' : 'No terminals in this context yet.'}</p>
      <input aria-label="Starting directory" className="w-full max-w-sm rounded border p-2 text-sm" placeholder="Starting directory (default: home)" value={cwd} onChange={event => setCwd(event.target.value)} />
      <button className="rounded border px-4 py-2 text-sm" disabled={busy || loading}>Open terminal</button>
    </form>}
  </div>
}
