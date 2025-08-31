# TODO

We should implement a more complex tree-view + data view component resembling a full-fledged file manager.
- Our update workspaces-details interface should support a tree view on the left and a document view on the right(we'll extend the functionality to support multiple open document views for different tree paths later)
- There should be a right side-pane with filters for the current schemas (this we already have, we just nead to streamline it), with additional input fields for custom tags, we should also create a for-now empty tab for Filters
- Interface should support standard FS methods: Cut/Copy/Paste/Remove/Delete + in the tree view MergeUp/MergeDown, SubtractUp/SubtractDown
  - Cut
  - Copy
  - Paste
  - Remove
  - Delete
  - mergeUp(contextPath): merge the bitmap of layer "foo" in context path "/work/foo/bar/baz" to bitmaps "bar" and "baz"
  - mergeDown(contextPath): merge the bitmap of layer "foo" in context path "/work/foo/bar/baz" to bitmap "work"
  - subtractUp(contextPath): subtract the bitmap of layer "foo" in context path "/work/foo/bar/baz" from bitmaps "bar" and "baz"
  - subtractDown(contextPath): subtract the bitmap of layer "foo" in context path "/work/foo/bar/baz" from bitmap "work"

It should also be possible to drag+drop documents from the document table view to the tree folders directly(copy) or drag+drop holding shift for move

API Routes for the currently supported operations
/workspaces/:workspace_id/tree/paths/move
    from: string
    to: string
    recursive: bool
    
/workspaces/:workspace_id/tree/paths/copy
    from: string
    to: string
    recursive: bool
    
    