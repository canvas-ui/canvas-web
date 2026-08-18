# TODO

## Simplify the canvas-web UI!!

- We need to add a "simple" or "compact" UI version and leave the current one as "advanced"
- Simple version
  - Focused on context switching, Pinned tree layers, canvases + a A2UI canvas controlled via an internal inferd UI runtime thread

## Applets (moved from canvas-server TODO; framework + Notes/Todos landed 2026-08-07/08, see README)

- [ ] Configurable keyboard shortcut to open an applet (Notes) directly, and a floating
      "Applets" button for ad-hoc opening (the toolbox FAB currently opens Filters).
- [ ] Global applets: none exist yet - a clock and/or calendar is the natural first one
      (the Global sub-tab shows an empty state until then). The camera-stream showcase
      (live synapsd results for a camera feed) is a global applet + the planned
      services.streams work.
- [ ] Standalone host niceties: tree-picker for the path binding (text input today),
      context labels in the picker (shows ids), remember last binding per applet.
- [ ] Manual ordering (needs order: in metadata - deliberately skipped).
- [ ] Applet niceties: tag editing, search-term highlighting inside the body, load-more
      beyond the first page.

## WebUI cosmetics

- [ ] (deffered) Content area section should support tabs

- [ ] Timelines panel: `crud:*` timelines are surfaced as dedicated toggles and
      kept out of the deletable list — decide whether they also need an explicit
      "system" badge. (Moved from canvas-synapsd/TODO.md 2026-08-18; the engine
      side of the adaptive-quantum work is done, this is the leftover UI call.)

## Published JSON Schemas (moved from canvas/TODO.md)

- [ ] Consume the server-published JSON Schemas and delete copied enums — the
      server half shipped (`/schemas/data/schema/<id>.json`); `src/lib/schema-meta.ts`
      still hardcodes metadata and never fetches them.

## Menu/design refactor (all integrations!)

- Electron/desktop overlay, webUI, browser extension and CLI support a bound (context) and a explorer(workspace) mode, this distinction supposed to be more prominent but hey, non-standard UI design idea + AI(react + shadcn) => "free wordpress template" design
  - Bound mode follows all changes within a context. If a context "foo" changes from /work/customer-a/task1 to /work/customer-a/task2, all bound applications should follow and load the relevant contextual data
  - Explorer mode freely browses data, but automatically fetches updates for the currently selected context path

  We need a clear design element that would be used across all integrations to indicate a bound state and probably also enable access to a slide-out sidebar menu to switch between both(maybe a sticky unobtrusive button on top left of the screen with some sane margin from the top toggling colors/icons)

## Proper file manager UI

We need to replace the current  tree+document view frankenstein with a nice clean re-usable implementation resembling a full-fledged file manager.
- Supports "Open folder to the left" of the tree view for shuffling data between a source view and your destination layers
- intuitive FTS + feature and timeline based queries with "Select All" selecting just the filtered state
- Vertically scrollable multi-right pane view, ctrl + click on the tree opens a new pane and tiles it, clicking on a "sub-folder" layer opens a new side pane etc
- Interface should support standard FS methods: Cut/Copy/Paste/Remove/Delete + in the tree view MergeUp(ctrl+click-select layers)/MergeDown, SubtractUp(ctrl + click-select layers)/SubtractDown
  - Cut
  - Copy | Copy IDs
  - Paste
  - Remove
  - Delete
  - mergeUp(contextPath): merge the bitmap of layer "foo" in context path "/work/foo/bar/baz" to bitmaps "bar" and "baz"
  - mergeDown(contextPath): merge the bitmap of layer "foo" in context path "/work/foo/bar/baz" to bitmap "work"
  - subtractUp(contextPath): subtract the bitmap of layer "foo" in context path "/work/foo/bar/baz" from bitmaps "bar" and "baz"
  - subtractDown(contextPath): subtract the bitmap of layer "foo" in context path "/work/foo/bar/baz" from bitmap "work"
  - Insert path (layer type Context, Label, recurs)
  - Remove path (recursive = bool)
  - Rename 
  - Lock/Unlock layer
  - Destroy layer

## Workspaces view update

- Cleanup workspace sharing (token and user email based)
- Add a UI to define and manage data sources (IMAP, S3, SMB, FS etc)
- Add agent and minion support(minion is a single-purpose model usually optimized for one task - for example classification of incomming emails, it communicates with an agent or directly fires system events)

## Context++

- Assign agents, minions and peers to contexts
- Proper context controls: lock/unlock (share/unshare already shipped in context settings)

## Tools

- simple MVP level editor to add / edit contacts (notes and todos shipped as applets, see README)

## Timeline map (design session needed)

Full "map, but for time" element: zoomable vertical ruler, one rule per timeline in the wide/extended view, colored per-timeline doc-type markers, zooming in gradually morphs the ruler into 2-week / 4-week / 2-month strips up to a standard calendar view. Requires UI mockups and a real-world usability test - deliberately descoped from the 2026-07-16 timeline revamp (which landed the density rail + quick-filter matrix + calendar picker as the functional baseline).

## Folder-as-task UX (idea, not spec'd)

Creating a "folder" in a context/directory tree is essentially creating a task/goal (work://customer-a/devops/jira-1234). Proposed: after creating an empty folder, open a dual B5-card canvas - its (empty) content on one side, an "associate data" picker (contacts, email subject matchers, folders, tabs) on the other; matching incoming data auto-associates with the path. Check scope with user before implementing.
