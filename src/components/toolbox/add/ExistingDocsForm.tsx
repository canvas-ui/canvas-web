import { useState } from 'react'
import { PickDocumentsCard } from '@/components/menu/shared/PickDocumentsCard'
import { useToastHelpers } from '@/hooks/useToastHelpers'
import { useToolbox } from '../toolbox-context'
import { useAddTarget, linkExistingDocuments } from './useAddTarget'

// Opens PickDocumentsCard as a flat right-docked panel (no backdrop dim, same
// treatment as document-list.tsx's own "Add existing…" action) rather than
// swapping it into the Add panel's body — the picker's two-step
// workspace/tree shell doesn't fit the panel's narrow fixed width.
export function ExistingDocsForm() {
  const { openAddPicker, closeAdd } = useToolbox()
  const target = useAddTarget()
  const { showSuccessToast, showErrorToast } = useToastHelpers()
  const [saving, setSaving] = useState(false)

  const handleConfirm = async (documentIds: number[]) => {
    setSaving(true)
    try {
      await linkExistingDocuments(target, documentIds)
      showSuccessToast(`${documentIds.length} document${documentIds.length !== 1 ? 's' : ''} added`)
      closeAdd()
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to add documents')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Mobile: M1/M2-style drawer over a scrim instead of a flat right dock */}
      <div className="fixed inset-0 z-[59] bg-black/30 animate-fade-in md:hidden" onClick={openAddPicker} aria-hidden />
      <div className="fixed inset-y-0 right-0 z-[60] flex items-stretch py-2 pr-2 max-md:bottom-2 max-md:left-2 max-md:top-2 max-md:py-0 max-md:pr-0 max-md:animate-fade-in">
        <PickDocumentsCard
          sizeClassName="h-full w-[420px] max-w-full max-md:w-full max-md:shadow-elevation-8"
          fixedWorkspaceName={target?.mode === 'workspace' ? target.workspaceName : undefined}
          saving={saving}
          onConfirm={handleConfirm}
          onClose={openAddPicker}
        />
      </div>
    </>
  )
}
