import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

// `?create=1` opens a page's creation panel. The M1 menu "+" buttons navigate
// here rather than opening an M2 form, so creation always happens in the
// content area where there is room for it. Closing the panel drops the param
// again, otherwise the panel would reopen on every back/forward.
export function useCreatePanel(): [boolean, (open: boolean) => void] {
  const [params, setParams] = useSearchParams()
  const requested = params.get('create') === '1'
  const [open, setOpen] = useState(requested)

  // Adjust during render rather than in an effect: arriving with ?create=1
  // must open the panel in the same pass, without a second render.
  const [wasRequested, setWasRequested] = useState(requested)
  if (requested !== wasRequested) {
    setWasRequested(requested)
    if (requested) setOpen(true)
  }

  const set = useCallback((next: boolean) => {
    setOpen(next)
    if (!next && requested) {
      const rest = new URLSearchParams(params)
      rest.delete('create')
      setParams(rest, { replace: true })
    }
  }, [params, requested, setParams])

  return [open, set]
}
