# TODO

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

- We need full drag-and-drop support
- Import/export documents(already there)

## Workspaces view update

- Cleanup workspace sharing (token and user email based)
- Add a UI to define and manage data sources (IMAP, S3, SMB, FS etc)
- Add agent and minion support(minion is a single-purpose model usually optimized for one task - for example classification of incomming emails, it communicates with an agent or directly fires system events)

## Context++

- Assign agents, minions and peers to contexts
- Proper context controlls (same as above - share/unshare, lock/unlock)

## Tools

- simple MVP level editors to add / edit notes, todo items, contacts
