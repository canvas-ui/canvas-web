import { useState } from 'react'
import { PageHeader } from '@/components/common/page-header'
import { useSettingsMenuBack } from '@/components/common/use-settings-back'
import { DEFAULT_KEY_BINDINGS, readKeyBindings, saveKeyBindings, type TreeAction, type KeyBindings } from '@/lib/key-bindings'

export default function KeyBindingsPage() {
  const [bindings, setBindings] = useState(readKeyBindings)
  const [message, setMessage] = useState('')
  const update = (next: KeyBindings) => {
    if (next.previousTree && next.previousTree === next.nextTree) {
      setMessage('Choose a different shortcut: that combination is already assigned.')
      return
    }
    try { saveKeyBindings(next); setBindings(next); setMessage('Saved on this device.') }
    catch { setMessage('Could not save shortcuts in this browser.') }
  }
  return <div className="mx-auto max-w-4xl">
    <PageHeader className="mb-6" title="Key bindings" onBack={useSettingsMenuBack()} description="Web UI shortcuts, saved on this device and available offline." />
    <section className="space-y-4 rounded-lg border p-4">
      <h2 className="font-medium">Tree navigation</h2>
      <p className="text-sm text-muted-foreground">Cycle the open workspace menu’s tabs in their displayed order, including Pins and Layers. Swipe left for next or right for previous over the tab bar. Shortcuts pause while typing or using a dialog.</p>
      {(['previousTree', 'nextTree'] as TreeAction[]).map(action => <div key={action} className="flex flex-wrap items-center gap-3">
        <label htmlFor={action} className="min-w-32 text-sm">{action === 'previousTree' ? 'Previous tree' : 'Next tree'}</label>
        <select id={action} className="rounded-md border bg-background p-2 text-sm" value={bindings[action].split('+').slice(0, -1).join('+')} onChange={e => update({ ...bindings, [action]: e.target.value ? `${e.target.value}+${bindings[action].slice(-1) || DEFAULT_KEY_BINDINGS[action].slice(-1)}` : '' })}>
          <option value="">Disabled</option>
          {['Alt', 'Alt+Shift', 'Ctrl+Shift', 'Meta+Shift'].map(mod => <option key={mod} value={mod}>{mod}</option>)}
        </select>
        <select aria-label={`${action === 'previousTree' ? 'Previous' : 'Next'} tree key`} disabled={!bindings[action]} className="rounded-md border bg-background p-2 text-sm disabled:opacity-50" value={bindings[action].slice(-1) || DEFAULT_KEY_BINDINGS[action].slice(-1)} onChange={e => update({ ...bindings, [action]: `${bindings[action].split('+').slice(0, -1).join('+')}+${e.target.value}` })}>
          {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(key => <option key={key} value={key}>{key}</option>)}
        </select>
      </div>)}
      <p className="text-xs text-muted-foreground">Browsers and operating systems may reserve combinations. Choose another if a shortcut does not reach Canvas. Letters refer to physical keyboard positions (Q/W on a US keyboard); Meta is Command on Mac.</p>
      <button type="button" className="rounded-md border px-3 py-2 text-sm hover:bg-accent" onClick={() => update({ ...DEFAULT_KEY_BINDINGS })}>Restore defaults</button>
      <p role="status" className="text-sm">{message}</p>
    </section>
  </div>
}
