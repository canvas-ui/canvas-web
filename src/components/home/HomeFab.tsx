import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { QUICK_ADD_CONFIG, type QuickAddKind, type QuickAddInitialData } from './quick-add-types'
import { NoteCardBody } from './cards/NoteCardBody'
import { LinkCardBody } from './cards/LinkCardBody'
import { FileCardBody } from './cards/FileCardBody'
import { PhotoCardBody } from './cards/PhotoCardBody'

interface HomeFabProps {
  // Opened directly (e.g. from the share-target flow) instead of via the FAB.
  initialKind?: QuickAddKind
  initialData?: QuickAddInitialData
  // Called instead of the normal "just drop the card" close when the initial
  // (share-target) card closes, e.g. to navigate back to /home.
  onInitialCardClose?: () => void
}

interface OpenCard {
  id: string
  kind: QuickAddKind
  initialData?: QuickAddInitialData
}

const KINDS: QuickAddKind[] = ['note', 'link', 'file', 'photo']

let cardSeq = 0
function nextCardId() {
  cardSeq += 1
  return `card-${cardSeq}`
}

export function HomeFab({ initialKind, initialData, onInitialCardClose }: HomeFabProps) {
  const [stackOpen, setStackOpen] = useState(false)
  const [openCards, setOpenCards] = useState<OpenCard[]>(() =>
    initialKind ? [{ id: 'initial', kind: initialKind, initialData }] : [],
  )
  const [hasCamera] = useState(() => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia)

  const kinds = hasCamera ? KINDS : KINDS.filter((k) => k !== 'photo')

  const addCard = (kind: QuickAddKind) => {
    setOpenCards((prev) => [...prev, { id: nextCardId(), kind }])
    setStackOpen(false)
  }

  const closeCard = (id: string) => {
    setOpenCards((prev) => prev.filter((c) => c.id !== id))
    if (id === 'initial') onInitialCardClose?.()
  }

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="flex flex-1 items-center gap-4 overflow-x-auto p-6">
        {openCards.map((c) => {
          const onClose = () => closeCard(c.id)
          switch (c.kind) {
            case 'note': return <NoteCardBody key={c.id} onClose={onClose} initialData={c.initialData} />
            case 'link': return <LinkCardBody key={c.id} onClose={onClose} initialData={c.initialData} />
            case 'file': return <FileCardBody key={c.id} onClose={onClose} initialData={c.initialData} />
            case 'photo': return <PhotoCardBody key={c.id} onClose={onClose} />
          }
        })}
      </div>

      <div className="pointer-events-none absolute bottom-6 right-6 flex flex-col items-end gap-3">
        <div
          className={cn(
            'flex flex-col items-end gap-3 transition-all duration-150',
            stackOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
          )}
        >
          {kinds.map((kind) => {
            const { label, icon: Icon } = QUICK_ADD_CONFIG[kind]
            return (
              <button
                key={kind}
                type="button"
                onClick={() => addCard(kind)}
                className="flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-medium shadow-elevation-3 transition-transform hover:scale-105"
              >
                {label}
                <Icon className="h-4 w-4" />
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={() => setStackOpen((o) => !o)}
          aria-label={stackOpen ? 'Close quick add' : 'Quick add'}
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-elevation-4 transition-transform hover:scale-105"
        >
          {stackOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </button>
      </div>
    </div>
  )
}
