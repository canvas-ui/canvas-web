export const DEFAULT_WORKSPACE_TREE_NAME = 'context'
export const BACKENDS_TREE_NAME = 'backends'

// Tree type from a well-known tree name. The pre-created trees are 'context'
// (context type), 'directory' and 'backends' (both directory type); custom
// trees should be resolved via listWorkspaceTrees instead. The server resolves
// a known tree by its own type, so this hint only decides for unknown trees.
export const treeTypeForName = (treeName?: string | null): 'context' | 'directory' =>
  treeName === 'directory' || treeName === BACKENDS_TREE_NAME ? 'directory' : 'context'
