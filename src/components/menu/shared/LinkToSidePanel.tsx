import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

// Sizing every "Link to…" side panel uses. Full column height so the tree gets
// the vertical room it wants; capped width so the content the user is linking
// FROM stays visible and scrollable beside it. Below md there is no room for a
// second column, so it covers the screen like the other drawers.
export const LINK_TO_SIDE_SIZE = 'h-full w-[380px] max-w-[90vw] max-md:w-full'

/**
 * The one host geometry for the "Link to…" card: a full-height panel docked to
 * the right edge, over a scrim that closes it.
 *
 * Every caller used to bring its own — the document list, rule builder and
 * inferd panel each centred it as a modal, while the applets docked it to the
 * side. A centred modal covers the very list you are linking from, so the side
 * dock won; keeping the geometry here means the next caller cannot re-introduce
 * the split.
 */
export function LinkToSidePanel({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div
      className="fixed inset-0 z-picker flex items-stretch justify-end bg-scrim animate-fade-in"
      onClick={onClose}
    >
      <div className="h-full p-2 max-md:w-full max-md:p-1" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    window.document.body,
  )
}
