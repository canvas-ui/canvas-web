import { useEffect, useId, useState, type RefObject } from 'react'
import { useRelationPredicates } from '@/hooks/useRelationPredicates'
import { relationSearchCompletion } from '@/lib/relation-search'

export function RelationSearchSuggestions({ workspaceId, inputRef, onChange }: {
  workspaceId?: string | null
  inputRef: RefObject<HTMLInputElement | null>
  onChange?: (query: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const registry = useRelationPredicates(workspaceId)
  const completion = relationSearchCompletion(draft, registry.predicates)
  const visible = !!workspaceId && open && completion !== null
  const options = completion?.predicates ?? []
  const listId = useId()
  const selected = Math.min(active, Math.max(0, options.length - 1))

  useEffect(() => {
    if (visible) document.getElementById(`${listId}-${selected}`)?.scrollIntoView({ block: 'nearest' })
  }, [listId, selected, visible, options.length])

  const choose = (predicate: string) => {
    const input = inputRef.current
    if (!input || !completion) return
    const value = `${completion.before}@${predicate}: `
    input.value = value
    onChange?.(value)
    setDraft(value)
    setOpen(false)
    input.focus()
  }

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const changed = () => { setDraft(input.value); setActive(0); setOpen(true) }
    const blur = () => setOpen(false)
    const keydown = (event: KeyboardEvent) => {
      if (!visible || event.isComposing) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false) }
      else if (options.length && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(event.key)) {
        event.preventDefault()
        event.stopPropagation()
        if (event.key === 'ArrowDown') setActive((selected + 1) % options.length)
        else if (event.key === 'ArrowUp') setActive((selected + options.length - 1) % options.length)
        else choose(options[selected])
      }
    }
    input.addEventListener('input', changed)
    input.addEventListener('focus', changed)
    input.addEventListener('blur', blur)
    input.addEventListener('keydown', keydown)
    input.setAttribute('role', 'combobox')
    input.setAttribute('aria-autocomplete', 'list')
    input.setAttribute('aria-expanded', String(visible))
    if (visible) input.setAttribute('aria-controls', listId)
    else input.removeAttribute('aria-controls')
    if (visible && options.length) input.setAttribute('aria-activedescendant', `${listId}-${selected}`)
    else input.removeAttribute('aria-activedescendant')
    return () => {
      input.removeEventListener('input', changed)
      input.removeEventListener('focus', changed)
      input.removeEventListener('blur', blur)
      input.removeEventListener('keydown', keydown)
      for (const name of ['role', 'aria-autocomplete', 'aria-expanded', 'aria-controls', 'aria-activedescendant']) input.removeAttribute(name)
    }
  })

  if (!visible) return null
  return <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
    <div id={listId} role="listbox" aria-label="Relation predicates">
      {options.map((predicate, index) => <button key={predicate} id={`${listId}-${index}`} type="button" role="option" aria-selected={index === selected}
        className={`block w-full rounded px-3 py-2 text-left text-sm font-mono ${index === selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'}`}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(predicate)}>@{predicate}:</button>)}
    </div>
    {!options.length && <p role="status" className="px-3 py-2 text-sm text-muted-foreground">{registry.loading ? 'Loading relations…' : registry.error ? 'Unable to load relation predicates.' : 'No matching predicates.'}</p>}
  </div>
}
