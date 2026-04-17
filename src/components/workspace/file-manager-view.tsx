import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Copy,
  Clipboard,
  X,
  Search,
  Filter,
  Tags,
  Plus,
  Key,
  TreePine,
  Settings2
} from 'lucide-react';
import { MenuTreeView } from '@/components/menu/shared/MenuTreeView';
import { DocumentList } from '@/components/common/document-list';
import { TokenManager } from '@/components/workspace/token-manager';
import { ServicesPanel } from '@/components/workspace/services-panel';
import { Button } from '@/components/ui/button';
import { TreeNode, Document } from '@/types/workspace';
import { cn } from '@/lib/utils';

interface FileManagerViewProps {
  // Tree data
  tree: TreeNode | null;
  workspaceTrees?: any[];
  selectedTreeName?: string;
  onSelectTree?: (treeName: string) => void;
  selectedPath: string;
  onPathSelect: (path: string) => void;
  isLoadingTree: boolean;

  // Documents data
  documents: Document[];
  isLoadingDocuments: boolean;
  totalCount: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;

  // Tree operations
  onInsertPath?: (path: string, autoCreateLayers?: boolean) => Promise<boolean>;
  onRemovePath?: (path: string, recursive?: boolean) => Promise<boolean>;
  onRenamePath?: (fromPath: string, newName: string) => Promise<boolean>;
  onMovePath?: (fromPath: string, toPath: string, recursive?: boolean) => Promise<boolean>;
  onCopyPath?: (fromPath: string, toPath: string, recursive?: boolean) => Promise<boolean>;
  onLockLayer?: (layerId: string) => Promise<boolean>;
  onUnlockLayer?: (layerId: string) => Promise<boolean>;
  onMergeLayer?: (layerId: string, targetLayers: string[]) => Promise<any>;
  onSubtractLayer?: (layerId: string, targetLayers: string[]) => Promise<any>;

  // Document operations
  onRemoveDocument?: (documentId: number, fromPath?: string) => void;
  onDeleteDocument?: (documentId: number) => void;
  onRemoveDocuments?: (documentIds: number[], fromPath?: string) => void;
  onDeleteDocuments?: (documentIds: number[]) => void;
  onPurgeDocuments?: () => void;
  onCopyDocuments?: (documentIds: number[]) => void;
  onCutDocuments?: (documentIds: number[]) => void;
  onPasteDocuments?: (path: string, documentIds: number[]) => Promise<boolean>;
  onImportDocuments?: (documents: any[], contextPath: string) => Promise<boolean>;

  // Filter/schema data
  schemas: string[];
  selectedSchemas: string[];
  onSchemaChange: (schemas: string[]) => void;
  isLoadingSchemas: boolean;

  // Clipboard state
  copiedDocuments: number[];

  // Workspace info for tokens
  workspaceId: string;
}

interface ClipboardState {
  documents: {
    ids: number[];
    operation: 'copy' | 'cut';
    sourcePath?: string;
  } | null;
  paths: {
    paths: string[];
    operation: 'copy' | 'cut';
  } | null;
}

interface FiltersTabProps {
  schemas: string[];
  selectedSchemas: string[];
  onSchemaChange: (schemas: string[]) => void;
  isLoadingSchemas: boolean;
}

interface TagsTabProps {
  customTags: string[];
  onTagsChange: (tags: string[]) => void;
}

function FiltersTab({ schemas, selectedSchemas, onSchemaChange, isLoadingSchemas }: FiltersTabProps) {
  const getSchemaDisplayName = (schema: string) => {
    const parts = schema.split('/');
    return parts[parts.length - 1] || schema;
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium mb-3">Filter by Schema</h4>
        {isLoadingSchemas ? (
          <div className="text-sm text-muted-foreground">Loading schemas...</div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {schemas.map((schema) => (
              <label key={schema} className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedSchemas.includes(schema)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onSchemaChange([...selectedSchemas, schema]);
                    } else {
                      onSchemaChange(selectedSchemas.filter(s => s !== schema));
                    }
                  }}
                  className="rounded border-gray-300"
                />
                <span title={schema}>
                  {getSchemaDisplayName(schema)}
                </span>
              </label>
            ))}
            {selectedSchemas.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSchemaChange([])}
                className="w-full mt-2"
              >
                Clear Filters
              </Button>
            )}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-sm font-medium mb-3">Quick Filters</h4>
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => onSchemaChange(['data/abstraction/tab'])}
          >
            <Search className="w-4 h-4 mr-2" />
            Web Tabs Only
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => onSchemaChange(['data/abstraction/file'])}
          >
            <Search className="w-4 h-4 mr-2" />
            Files Only
          </Button>
        </div>
      </div>
    </div>
  );
}

function TagsTab({ customTags, onTagsChange }: TagsTabProps) {
  const [newTag, setNewTag] = useState('');

  const handleAddTag = () => {
    if (newTag.trim() && !customTags.includes(newTag.trim())) {
      onTagsChange([...customTags, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onTagsChange(customTags.filter(tag => tag !== tagToRemove));
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium mb-3">Custom Tags</h4>
        <div className="flex gap-2 mb-3">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="Add custom tag..."
            className="flex-1 px-3 py-2 border border-input rounded-md bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddTag();
              }
            }}
          />
          <Button
            size="sm"
            onClick={handleAddTag}
            disabled={!newTag.trim() || customTags.includes(newTag.trim())}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-1 max-h-40 overflow-y-auto">
          {customTags.map((tag) => (
            <div
              key={tag}
              className="flex items-center justify-between px-2 py-1 bg-muted rounded text-sm"
            >
              <span>{tag}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveTag(tag)}
                className="h-auto p-1 hover:bg-destructive hover:text-destructive-foreground"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
          {customTags.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">
              No custom tags yet. Add tags to organize your documents.
            </div>
          )}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium mb-3">Tag Actions</h4>
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            disabled={customTags.length === 0}
          >
            <Tags className="w-4 h-4 mr-2" />
            Apply Tags to Selection
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            disabled={customTags.length === 0}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filter by Tags
          </Button>
        </div>
      </div>
    </div>
  );
}

export function FileManagerView({
  tree,
  workspaceTrees,
  selectedTreeName,
  onSelectTree,
  selectedPath,
  onPathSelect,
  isLoadingTree,
  documents,
  isLoadingDocuments,
  totalCount,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onLockLayer,
  onUnlockLayer,
  onInsertPath,
  onRemovePath,
  onRenamePath,
  onMovePath,
  onCopyPath,
  onMergeLayer,
  onSubtractLayer,
  onRemoveDocument,
  onDeleteDocument,
  onRemoveDocuments,
  onDeleteDocuments,
  onPurgeDocuments,
  onCopyDocuments,
  onCutDocuments,
  onPasteDocuments,
  onImportDocuments,
  schemas,
  selectedSchemas,
  onSchemaChange,
  isLoadingSchemas,
  copiedDocuments,
  workspaceId
}: FileManagerViewProps) {
  const [leftTab, setLeftTab] = useState<string>(selectedTreeName || 'tree');
  const [rightTab, setRightTab] = useState<'filters' | 'tags' | 'tokens' | 'services'>('filters');
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<ClipboardState>({
    documents: null,
    paths: null
  });
  const [globalContextMenu, setGlobalContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Sync leftTab when selectedTreeName changes from parent
  useEffect(() => {
    if (selectedTreeName) {
      setLeftTab(selectedTreeName);
    }
  }, [selectedTreeName]);

  // Enhanced document operations with clipboard
  const handleCopyDocuments = useCallback((documentIds: number[]) => {
    setClipboard(prev => ({
      ...prev,
      documents: { ids: documentIds, operation: 'copy' }
    }));
    onCopyDocuments?.(documentIds);
  }, [onCopyDocuments]);

  const handleCutDocuments = useCallback((documentIds: number[]) => {
    console.log('File-manager handleCutDocuments:', { documentIds, selectedPath });
    setClipboard(prev => ({
      ...prev,
      documents: { ids: documentIds, operation: 'cut', sourcePath: selectedPath }
    }));
    onCutDocuments?.(documentIds);
  }, [onCutDocuments, selectedPath]);

  const handlePasteDocuments = useCallback(async (path: string) => {
    if (!clipboard.documents || !onPasteDocuments) return false;

    console.log('File-manager handlePasteDocuments:', {
      path,
      documentIds: clipboard.documents.ids,
      operation: clipboard.documents.operation,
      sourcePath: clipboard.documents.sourcePath
    });

    const success = await onPasteDocuments(path, clipboard.documents.ids);
    console.log('File-manager paste success:', success);

        // If it was a cut operation and paste succeeded, remove from original location
    if (success && clipboard.documents.operation === 'cut') {
      const sourcePath = clipboard.documents.sourcePath;
      console.log('File-manager removing documents after cut:', {
        documentIds: clipboard.documents.ids,
        sourcePath,
        isMultiple: clipboard.documents.ids.length > 1,
        pastedDocumentIds: clipboard.documents.ids
      });

      // Verify that the document IDs we're trying to remove match what was pasted
      const idsToRemove = clipboard.documents.ids;
      console.log('Document IDs to remove:', idsToRemove);

      if (idsToRemove.length === 1) {
        console.log('Calling onRemoveDocument for single document:', idsToRemove[0]);
        onRemoveDocument?.(idsToRemove[0], sourcePath);
      } else {
        console.log('Calling onRemoveDocuments for multiple documents:', idsToRemove);
        onRemoveDocuments?.(idsToRemove, sourcePath);
      }
    }

    // Clear clipboard after successful paste
    if (success) {
      setClipboard(prev => ({ ...prev, documents: null }));
    }

    return success;
  }, [clipboard.documents, onPasteDocuments, onRemoveDocument, onRemoveDocuments]);

  const handlePastePath = useCallback(async (targetPath: string) => {
    if (!clipboard.paths) return false;

    let allSuccess = true;
    for (const sourcePath of clipboard.paths.paths) {
      if (clipboard.paths.operation === 'cut') {
        const success = await onMovePath?.(sourcePath, targetPath, false);
        if (!success) allSuccess = false;
      } else {
        const success = await onCopyPath?.(sourcePath, targetPath, false);
        if (!success) allSuccess = false;
      }
    }

    if (allSuccess) {
      setClipboard(prev => ({ ...prev, paths: null }));
    }

    return allSuccess;
  }, [clipboard.paths, onMovePath, onCopyPath]);

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Only handle shortcuts when focused on the file manager
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return; // Don't interfere with input fields
    }

    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'c':
          // Copy operation - for now just show a message
          e.preventDefault();
          console.log('Copy shortcut pressed');
          break;
        case 'x':
          // Cut operation - for now just show a message
          e.preventDefault();
          console.log('Cut shortcut pressed');
          break;
        case 'v':
          // Paste to current path
          e.preventDefault();
          if (clipboard.documents) {
            handlePasteDocuments(selectedPath);
          } else if (clipboard.paths) {
            handlePastePath(selectedPath);
          }
          break;
        case 'a':
          // Select all (could be implemented in DocumentList)
          e.preventDefault();
          console.log('Select all shortcut pressed');
          break;
      }
    } else {
      switch (e.key) {
        case 'Delete':
          // Delete selected items
          e.preventDefault();
          console.log('Delete shortcut pressed');
          break;
        case 'F2':
          // Rename (could trigger rename modal)
          e.preventDefault();
          console.log('Rename shortcut pressed');
          break;
        case 'Escape':
          // Clear selections/close modals
          e.preventDefault();
          setGlobalContextMenu(null);
          break;
      }
    }
  }, [clipboard, selectedPath, handlePasteDocuments, handlePastePath]);

  // Add/remove keyboard event listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Global context menu for empty areas
  const handleGlobalRightClick = useCallback((e: React.MouseEvent) => {
    // Only show global context menu if we have something to paste or other global actions
    const hasClipboard = clipboard.documents || clipboard.paths;
    if (!hasClipboard) return;

    e.preventDefault();
    setGlobalContextMenu({ x: e.clientX, y: e.clientY });
  }, [clipboard]);

  const handleGlobalContextMenuAction = useCallback(async (action: string) => {
    switch (action) {
      case 'paste-documents':
        if (clipboard.documents) {
          await handlePasteDocuments(selectedPath);
        }
        break;
      case 'paste-paths':
        if (clipboard.paths) {
          await handlePastePath(selectedPath);
        }
        break;
      case 'new-folder':
        if (onInsertPath) {
          const folderName = prompt('Enter folder name:');
          if (folderName) {
            const newPath = selectedPath === '/' ? `/${folderName}` : `${selectedPath}/${folderName}`;
            await onInsertPath(newPath, true);
          }
        }
        break;
    }
    setGlobalContextMenu(null);
  }, [clipboard, selectedPath, handlePasteDocuments, handlePastePath, onInsertPath]);

  return (
    <div
      className="flex h-auto min-h-0 gap-4"
      onContextMenu={handleGlobalRightClick}
    >
      {/* Left Panel - Tree View */}
      <div className="w-72 min-w-72 border rounded-lg bg-card flex flex-col">
        {/* Tab Header — only shown when multiple trees exist */}
        {workspaceTrees && workspaceTrees.length > 1 && (
          <div className="flex border-b overflow-x-auto">
            {workspaceTrees.map((t) => (
              <button
                key={t.id ?? t.name}
                className={cn(
                  "flex-shrink-0 py-3 px-3 text-xs font-medium transition-colors whitespace-nowrap",
                  leftTab === t.name
                    ? 'border-b-2 border-primary bg-background'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => {
                  setLeftTab(t.name);
                  onSelectTree?.(t.name);
                }}
              >
                <TreePine className="w-3 h-3 mr-1 inline" />
                {t.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0">
          <MenuTreeView
            root={tree}
            selectedPath={selectedPath}
            onSelect={onPathSelect}
            isLoading={isLoadingTree}
            onInsertPath={onInsertPath}
            onRemovePath={onRemovePath}
            onRenamePath={onRenamePath}
            onMovePath={onMovePath}
            onCopyPath={onCopyPath}
            onLockLayer={onLockLayer}
            onUnlockLayer={onUnlockLayer}
            onMergeLayer={onMergeLayer}
            onSubtractLayer={onSubtractLayer}
          />
        </div>
      </div>

      {/* Center Panel - Document List */}
      <div className="flex-1 min-w-0 border rounded-lg bg-card flex flex-col min-h-0">
        <DocumentList
          documents={documents}
          isLoading={isLoadingDocuments}
          contextPath={selectedPath}
          totalCount={totalCount}
          viewMode="table"
          onRemoveDocument={selectedPath !== '/' ? onRemoveDocument : undefined}
          onDeleteDocument={onDeleteDocument}
          onRemoveDocuments={selectedPath !== '/' ? onRemoveDocuments : undefined}
          onDeleteDocuments={onDeleteDocuments}
          onPurgeDocuments={onPurgeDocuments}
          onCopyDocuments={handleCopyDocuments}
          onCutDocuments={handleCutDocuments}
          onPasteDocuments={handlePasteDocuments}
          onImportDocuments={onImportDocuments}
          pastedDocumentIds={clipboard.documents?.ids || copiedDocuments}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      </div>

      {/* Right Panel - Filters & Tags */}
      <div className="w-72 min-w-72 border rounded-lg bg-card flex flex-col">
        <div className="flex border-b">
          <button
            className={cn(
              "flex-1 py-3 px-2 text-xs font-medium transition-colors",
              rightTab === 'filters'
                ? 'border-b-2 border-primary bg-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setRightTab('filters')}
          >
            <Filter className="w-3 h-3 mr-1 inline" />
            Filters
          </button>
          <button
            className={cn(
              "flex-1 py-3 px-2 text-xs font-medium transition-colors",
              rightTab === 'tags'
                ? 'border-b-2 border-primary bg-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setRightTab('tags')}
          >
            <Tags className="w-3 h-3 mr-1 inline" />
            Tags
          </button>
          <button
            className={cn(
              "flex-1 py-3 px-2 text-xs font-medium transition-colors",
              rightTab === 'tokens'
                ? 'border-b-2 border-primary bg-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setRightTab('tokens')}
          >
            <Key className="w-3 h-3 mr-1 inline" />
            Tokens
          </button>
          <button
            className={cn(
              "flex-1 py-3 px-2 text-xs font-medium transition-colors",
              rightTab === 'services'
                ? 'border-b-2 border-primary bg-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setRightTab('services')}
          >
            <Settings2 className="w-3 h-3 mr-1 inline" />
            Services
          </button>
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          {rightTab === 'filters' ? (
            <FiltersTab
              schemas={schemas}
              selectedSchemas={selectedSchemas}
              onSchemaChange={onSchemaChange}
              isLoadingSchemas={isLoadingSchemas}
            />
          ) : rightTab === 'tags' ? (
            <TagsTab
              customTags={customTags}
              onTagsChange={setCustomTags}
            />
          ) : rightTab === 'tokens' ? (
            <TokenManager workspaceId={workspaceId} />
          ) : (
            <ServicesPanel workspaceId={workspaceId} />
          )}
        </div>

        {/* Clipboard Status */}
        {(clipboard.documents || clipboard.paths) && (
          <div className="border-t p-3 bg-muted/50">
            <div className="text-xs text-muted-foreground mb-2">Clipboard:</div>
            {clipboard.documents && (
              <div className="flex items-center gap-2 text-xs">
                <Copy className="w-3 h-3" />
                <span>{clipboard.documents.ids.length} document(s)</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setClipboard(prev => ({ ...prev, documents: null }))}
                  className="ml-auto h-auto p-1"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}
            {clipboard.paths && (
              <div className="flex items-center gap-2 text-xs">
                <Copy className="w-3 h-3" />
                <span>{clipboard.paths.paths.length} folder(s)</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setClipboard(prev => ({ ...prev, paths: null }))}
                  className="ml-auto h-auto p-1"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Global Context Menu */}
      {globalContextMenu && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setGlobalContextMenu(null)} />
          <div
            className="fixed z-50 min-w-[10rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ left: globalContextMenu.x, top: globalContextMenu.y }}
          >
            {clipboard.documents && (
              <button
                className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                onClick={() => handleGlobalContextMenuAction('paste-documents')}
              >
                <Clipboard className="w-4 h-4 mr-2" />
                Paste Documents ({clipboard.documents.ids.length})
              </button>
            )}
            {clipboard.paths && (
              <button
                className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                onClick={() => handleGlobalContextMenuAction('paste-paths')}
              >
                <Clipboard className="w-4 h-4 mr-2" />
                Paste Folders ({clipboard.paths.paths.length})
              </button>
            )}
            {(clipboard.documents || clipboard.paths) && (
              <div className="my-1 h-px bg-border" />
            )}
            <button
              className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
              onClick={() => handleGlobalContextMenuAction('new-folder')}
            >
              <Plus className="w-4 h-4 mr-2" />
              New Folder
            </button>
          </div>
        </>,
        document.body
      )}

    </div>
  );
}
