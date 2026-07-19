import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Pin } from 'lucide-react';
import { HomeFab } from '@/components/home/HomeFab';
import { PinnedCanvasTile } from '@/components/home/PinnedCanvasTile';
import { useCanvasPins } from '@/components/home/pins-context';
import type { PinnedCanvas } from '@/services/user-config';

function EmptyHome() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
      <Pin className="w-8 h-8 text-muted-foreground/60" />
      <p className="text-sm text-muted-foreground">No canvases pinned yet.</p>
      <p className="text-xs text-muted-foreground max-w-sm">
        Open a canvas in a workspace and use its <span className="font-medium">Pin</span> button to
        show it here. Pinned canvases tile side by side.
      </p>
      <Link to="/workspaces" className="mt-1 px-2.5 py-1 text-xs border rounded-md hover:bg-accent">
        Browse workspaces
      </Link>
    </div>
  );
}

function tabLabel(pin: PinnedCanvas) {
  return pin.label || pin.path.split('/').filter(Boolean).pop() || 'Canvas';
}

// Browser-like tab strip for minimized tiles. Sits at the bottom of the home
// area (absolute, not fixed: fixed would cross the shell's rail/sidebar).
// Clicking a tab restores its tile.
function MinimizedTabBar({ pins, onRestore }: { pins: PinnedCanvas[]; onRestore: (id: string) => void }) {
  if (pins.length === 0) return null;
  return (
    <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-40">
      {/* md:pr-28 keeps tabs from sliding under the FAB column (right-6, w-16). */}
      <div className="pointer-events-auto flex items-end gap-1 overflow-x-auto px-3 md:pr-28 pb-[env(safe-area-inset-bottom)]">
        {pins.map((pin) => (
          <button
            key={pin.id}
            type="button"
            onClick={() => onRestore(pin.id)}
            title={`Restore ${tabLabel(pin)}`}
            className="flex max-w-[180px] shrink-0 items-center gap-1.5 rounded-t-lg border border-b-0 bg-background px-3 py-1.5 text-xs shadow-sm hover:bg-accent"
          >
            <LayoutDashboard className="h-3.5 w-3.5 shrink-0 text-violet-500" />
            <span className="truncate">{tabLabel(pin)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const { pins, unpin, isLoading } = useCanvasPins();
  const [minimizedIds, setMinimizedIds] = useState<ReadonlySet<string>>(new Set());
  // Tiles the quick-add flow minimized (vs. the tile's own minimize button):
  // only these restore automatically when the last quick-add card closes.
  const autoMinimizedRef = useRef<Set<string>>(new Set());
  // Ref (not a useCallback dep) so the handler identity stays stable — HomeFab
  // notifies on open/close transitions and must not re-fire when pins change.
  const pinsRef = useRef(pins);
  pinsRef.current = pins;

  const minimize = (id: string) => {
    setMinimizedIds((prev) => new Set(prev).add(id));
  };

  const restore = (id: string) => {
    autoMinimizedRef.current.delete(id);
    setMinimizedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // Adding a Note/File/… needs the stage: minimize every visible tile while
  // quick-add cards are open, restore (only) those when the last card closes.
  const handleCardsOpenChange = useCallback((open: boolean) => {
    if (open) {
      setMinimizedIds((prev) => {
        const next = new Set(prev);
        for (const pin of pinsRef.current) {
          if (!next.has(pin.id)) {
            next.add(pin.id);
            autoMinimizedRef.current.add(pin.id);
          }
        }
        return next;
      });
    } else {
      setMinimizedIds((prev) => {
        const next = new Set(prev);
        for (const id of autoMinimizedRef.current) next.delete(id);
        autoMinimizedRef.current.clear();
        return next;
      });
    }
  }, []);

  const visiblePins = pins.filter((pin) => !minimizedIds.has(pin.id));
  const minimizedPins = pins.filter((pin) => minimizedIds.has(pin.id));

  return (
    // HomeFab owns a full-page box (it centres its quick-add cards in it), so
    // it overlays the canvases rather than sitting after them in flow - as a
    // sibling it stacked a second page height below and made an empty home
    // scroll. pointer-events-none keeps the tiles clickable through it; the
    // FAB and the card row re-enable their own.
    <div className="relative h-full">
      <div className="h-full overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">Loading…</div>
        ) : pins.length === 0 ? (
          <EmptyHome />
        ) : (
          // h-full (NOT min-h-full) + auto-rows-fr: the home never scrolls -
          // rows split the view and each canvas scrolls its own content.
          // h-full is load-bearing: min-height leaves the grid's block size
          // indefinite, so `fr` rows stop distributing and EACH row resolves to
          // the full height (two rows => 2x the viewport => a page scrollbar).
          // A row floor is deliberately absent for the same reason.
          // auto-fit + a 640px column floor rather than a breakpoint: that
          // floor IS CanvasGrid's NARROW_WIDTH, below which a canvas collapses
          // to its stacked mobile layout. So tiles pack side by side only while
          // they stay wide enough to show their real layout, and a lone canvas
          // spans the full width (auto-fit collapses the empty track).
          // min(640px,100%) keeps the column from overflowing a narrow phone.
          // Extra bottom padding while the tab strip is up so no tile hides
          // behind it.
          <div
            className={`grid gap-4 p-4 h-full grid-cols-[repeat(auto-fit,minmax(min(640px,100%),1fr))] auto-rows-fr ${
              minimizedPins.length > 0 ? 'pb-12' : ''
            }`}
          >
            {visiblePins.map((pin) => (
              <PinnedCanvasTile
                key={pin.id}
                pin={pin}
                onUnpin={() => { void unpin(pin.id); }}
                onMinimize={() => minimize(pin.id)}
              />
            ))}
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute inset-0">
        <HomeFab onCardsOpenChange={handleCardsOpenChange} />
      </div>
      <MinimizedTabBar pins={minimizedPins} onRestore={restore} />
    </div>
  );
}
