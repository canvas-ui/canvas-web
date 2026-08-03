import { useState } from 'react'
import { PickDocumentsCard } from '@/components/menu/shared/PickDocumentsCard'
import { LinkToCard } from '@/components/menu/shared/LinkToCard'
import { pasteDocumentsToWorkspacePath } from '@/services/workspace'
import { useToastHelpers } from '@/hooks/useToastHelpers'

// Sizing that matches a quick-add B5 card in the home row, including the
// mobile full-screen treatment B5Card applies below md.
const CARD_SIZE =
  'shrink-0 h-[85dvh] w-[min(380px,90vw)] max-md:fixed max-md:inset-2 max-md:z-40 max-md:h-auto max-md:w-auto max-md:shadow-elevation-5'

// Quick-add "internally indexed documents": browse/pick existing documents
// first (PickDocumentsCard), then pick the destination path(s) (LinkToCard)
// and link them there — the two shared pickers every other screen uses.
export function ExistingCardBody({ onClose }: { onClose: () => void }) {
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  const [pickedIds, setPickedIds] = useState<number[] | null>(null)
  const [saving, setSaving] = useState(false)

  if (!pickedIds) {
    return (
      <PickDocumentsCard
        sizeClassName={CARD_SIZE}
        onConfirm={(ids) => { if (ids.length) setPickedIds(ids) }}
        onClose={onClose}
      />
    )
  }

  return (
    <LinkToCard
      sizeClassName={CARD_SIZE}
      documentCount={pickedIds.length}
      saving={saving}
      onClose={onClose}
      onConfirm={async (paths, ctx) => {
        setSaving(true)
        try {
          await Promise.all(paths.map((p) =>
            pasteDocumentsToWorkspacePath(ctx.workspaceName, p, pickedIds, ctx.treeName, ctx.treeType)))
          showSuccessToast(`${pickedIds.length} document${pickedIds.length !== 1 ? 's' : ''} linked`)
          onClose()
        } catch (err) {
          showErrorToast(err instanceof Error ? err.message : 'Failed to link documents')
        } finally {
          setSaving(false)
        }
      }}
    />
  )
}
