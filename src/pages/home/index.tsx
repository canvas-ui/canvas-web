import { Link } from 'react-router-dom';
import { Pin } from 'lucide-react';
import { HomeFab } from '@/components/home/HomeFab';
import { PinnedCanvasTile } from '@/components/home/PinnedCanvasTile';
import { useCanvasPins } from '@/components/home/pins-context';

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

export default function HomePage() {
  const { pins, unpin, isLoading } = useCanvasPins();

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
          <div className="grid gap-4 p-4 h-full grid-cols-[repeat(auto-fit,minmax(min(640px,100%),1fr))] auto-rows-fr">
            {pins.map((pin) => (
              <PinnedCanvasTile key={pin.id} pin={pin} onUnpin={() => { void unpin(pin.id); }} />
            ))}
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute inset-0">
        <HomeFab />
      </div>
    </div>
  );
}
