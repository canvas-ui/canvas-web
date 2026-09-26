import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AlertDialog as Dialog, AlertDialogContent as DialogContent, AlertDialogHeader as DialogHeader, AlertDialogTitle as DialogTitle, AlertDialogDescription as DialogDescription } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type WorkspaceStartOptions = { passphrase?: string; withoutSecrets?: boolean }

/** Called only by an explicit Start action. No credential is retained after closing. */
export function requestWorkspaceUnlock(mode: string): Promise<WorkspaceStartOptions> {
  return new Promise((resolve, reject) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const finish = (options?: WorkspaceStartOptions) => {
      root.unmount()
      host.remove()
      if (options) resolve(options)
      else reject(new Error('Workspace start cancelled'))
    }
    function Unlock() {
      const [passphrase, setPassphrase] = useState('')
      return <Dialog open onOpenChange={(open) => { if (!open) finish() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start protected workspace</DialogTitle>
            <DialogDescription>{mode === 'workspace'
              ? 'Enter the workspace PIN/password or recovery key to start.'
              : 'Unlock integrations, or start with authenticated integrations unavailable.'}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); finish({ passphrase }) }}>
            <label className="space-y-2 block text-sm">PIN/password or recovery key
              <Input autoFocus type="password" autoComplete="current-password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!passphrase}>Unlock and start</Button>
              {mode === 'secrets' && <Button type="button" variant="outline" onClick={() => finish({ withoutSecrets: true })}>Start without integrations</Button>}
              <Button type="button" variant="ghost" onClick={() => finish()}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    }
    root.render(<Unlock />)
  })
}
