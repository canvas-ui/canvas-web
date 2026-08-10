import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InsertMenu, type InsertKind } from '@/components/common/insert-menu'
import { type QuickAddKind, type QuickAddInitialData } from './quick-add-types'
import { NoteCardBody } from './cards/NoteCardBody'
import { LinkCardBody } from './cards/LinkCardBody'
import { TodoCardBody } from './cards/TodoCardBody'
import { FileCardBody } from './cards/FileCardBody'
import { PhotoCardBody } from './cards/PhotoCardBody'
import { ExistingCardBody } from './cards/ExistingCardBody'

interface HomeFabProps {
  // Opened directly (e.g. from the share-target flow) instead of via the FAB.
  initialKind?: QuickAddKind
  initialData?: QuickAddInitialData
  // Called instead of the normal "just drop the card" close when the initial
  // (share-target) card closes, e.g. to navigate back to /home.
  onInitialCardClose?: () => void
  // Fires on open/close transitions of the quick-add card row (true while at
  // least one card is open). Home uses it to minimize its pinned tiles so the
  // cards get the stage.
  onCardsOpenChange?: (open: boolean) => void
}

interface OpenCard {
  id: string
  kind: InsertKind
  initialData?: QuickAddInitialData
}

let cardSeq = 0
function nextCardId() {
  cardSeq += 1
  return `card-${cardSeq}`
}

export function HomeFab({ initialKind, initialData, onInitialCardClose, onCardsOpenChange }: HomeFabProps) {
  const [stackOpen, setStackOpen] = useState(false)
  const [openCards, setOpenCards] = useState<OpenCard[]>(() =>
    initialKind ? [{ id: 'initial', kind: initialKind, initialData }] : [],
  )

  // Notify only on open/close transitions; the callback rides in a ref so a
  // parent re-render can never re-fire the effect with the same value.
  const hasOpenCards = openCards.length > 0
  const onCardsOpenChangeRef = useRef(onCardsOpenChange)
  onCardsOpenChangeRef.current = onCardsOpenChange
  useEffect(() => {
    onCardsOpenChangeRef.current?.(hasOpenCards)
  }, [hasOpenCards])

  const addCard = (kind: InsertKind) => {
    setOpenCards((prev) => [...prev, { id: nextCardId(), kind }])
    setStackOpen(false)
  }

  const closeCard = (id: string) => {
    setOpenCards((prev) => prev.filter((c) => c.id !== id))
    if (id === 'initial') onInitialCardClose?.()
  }

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* `md:pr-28` reserves an invisible panel on the right so cards never
          scroll underneath the floating buttons that dock bottom-right. On
          mobile the buttons float over the full-width cards instead.
          Only mounted while a card is open: home overlays this row on top of
          its pinned canvases, so an empty row would swallow clicks on them
          (and, in flow, stack a second full page height under the content).
          `pointer-events-auto` re-enables clicks inside that overlay. */}
      {openCards.length > 0 && (
      <div className="pointer-events-auto flex flex-1 items-center gap-4 overflow-x-auto p-6 md:pr-28">
        {openCards.map((c) => {
          const onClose = () => closeCard(c.id)
          switch (c.kind) {
            case 'note': return <NoteCardBody key={c.id} onClose={onClose} initialData={c.initialData} />
            case 'link': return <LinkCardBody key={c.id} onClose={onClose} initialData={c.initialData} />
            case 'todo': return <TodoCardBody key={c.id} onClose={onClose} initialData={c.initialData} />
            case 'file': return <FileCardBody key={c.id} onClose={onClose} initialData={c.initialData} />
            case 'photo': return <PhotoCardBody key={c.id} onClose={onClose} />
            case 'existing': return <ExistingCardBody key={c.id} onClose={onClose} />
            // 'folder' is omitted from the home stack — folders are created
            // inside the Link to… destination tree instead.
            case 'folder': return null
          }
        })}
      </div>
      )}

      {/* Desktop: stacked above the (bigger) toolbox FAB, which docks
          bottom-right at h-16 with a 16px gap. Mobile: the FAB is hidden, so
          the stack sits at the bottom edge itself — and disappears entirely
          while a card is open so nothing floats over the card's controls.
          `z-40` keeps it above any card in the row. */}
      <div
        className={cn(
          // `fixed` (not absolute) so this shares the toolbox FAB's viewport
          // reference frame — an `absolute` box here is inset by the home
          // scroll container's scrollbar and drifts out of alignment with the
          // fixed toolbox FAB below it.
          'pointer-events-none fixed right-6 z-40 flex flex-col items-end gap-2',
          'bottom-fab-inset md:bottom-[calc(var(--spacing-fab-inset)+5rem)]',
          openCards.length > 0 && 'max-md:hidden',
        )}
      >
        <div
          className={cn(
            'flex flex-col items-end gap-2 transition-all duration-150',
            stackOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
          )}
        >
          {/* Shared insertion menu — same entries/order as the AddPanel
              picker, minus Folder: on home a folder has no natural location,
              so folders are created inside the Link to… destination tree
              (long-press / right-click a row) instead. */}
          <InsertMenu variant="stack" omit={['folder']} onSelect={addCard} />
        </div>

        {/* Center the smaller + over the toolbox FAB's column (both dock at
            right-6; the toolbox is w-16). Centering in a w-16 wrapper aligns
            their centers regardless of scrollbar width. */}
        <div className="pointer-events-none flex w-16 justify-center">
          <button
            type="button"
            onClick={() => setStackOpen((o) => !o)}
            aria-label={stackOpen ? 'Close quick add' : 'Quick add'}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-elevation-3 transition-transform hover:scale-105"
          >
            {stackOpen ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  )
}
