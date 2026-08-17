// The FAB quick-capture surface (home, and the share-target landing that
// reuses it) has no page chrome of its own — no "sheet of paper" card, no
// padding — it sits directly on the surface-desk background.
// Also covers the empty desk at `/` — with every section closed there is no
// page to frame, so the surface shows through.
// Shared by ContentArea (chrome decision) and ToolboxFab (the FAB only shows
// on these bare routes — on content pages the rail carries the toolbox entry).
export function isBare(pathname: string): boolean {
  const [section] = pathname.split('/').filter(Boolean)
  return !section || section === 'home' || section === 'share-target'
}
