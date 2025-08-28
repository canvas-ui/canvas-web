import { useState, useCallback, useMemo } from 'react'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TreeView } from './tree-view'
import { DocumentList } from './document-list'
import { TreeNode, Document } from '@/types/workspace'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { 
  Filter, 
  Tag, 
  X, 
  Plus,
  FileText,
  Folders,
  Search
} from 'lucide-react'
import { useToast } from '@/components/ui/toast-container'

interface FileManagerProps {
  // Tree data
  tree: TreeNode
  selectedPath: string
  onPathSelect: (path: string) => void
  
  // Document data
  documents: Document[]
  isLoadingDocuments: boolean
  documentsTotalCount: number
  
  // File system operations
  onInsertPath?: (path: string, autoCreateLayers?: boolean) => Promise<boolean>
  onRemovePath?: (path: string, recursive?: boolean) => Promise<boolean>
  onMovePath?: (fromPath: string, toPath: string, recursive?: boolean) => Promise<boolean>
  onCopyPath?: (fromPath: string, toPath: string, recursive?: boolean) => Promise<boolean>
  onMergeUp?: (path: string) => Promise<boolean>
  onMergeDown?: (path: string) => Promise<boolean>
  onSubtractUp?: (path: string) => Promise<boolean>
  onSubtractDown?: (path: string) => Promise<boolean>
  
  // Document operations
  onRemoveDocument?: (documentId: number) => void
  onDeleteDocument?: (documentId: number) => void
  onRemoveDocuments?: (documentIds: number[]) => void
  onDeleteDocuments?: (documentIds: number[]) => void
  onCopyDocuments?: (documentIds: number[]) => void
  onPasteDocuments?: (path: string, documentIds: number[]) => Promise<boolean>
  onImportDocuments?: (documents: any[], contextPath: string) => Promise<boolean>
  
  // State
  pastedDocumentIds?: number[]
  readOnly?: boolean
  
  // Context
  contextPath?: string
  activeContextUrl?: string
  currentContextUrl?: string
}

interface FiltersPanelProps {
  documents: Document[]
  selectedSchemas: Set<string>
  onSchemaToggle: (schema: string) => void
  customTags: string[]
  onTagAdd: (tag: string) => void
  onTagRemove: (tag: string) => void
  searchQuery: string
  onSearchChange: (query: string) => void
}

function FiltersPanel({ 
  documents, 
  selectedSchemas, 
  onSchemaToggle, 
  customTags, 
  onTagAdd, 
  onTagRemove, 
  searchQuery, 
  onSearchChange 
}: FiltersPanelProps) {
  const [newTag, setNewTag] = useState('')
  
  // Get unique schemas from documents
  const availableSchemas = useMemo(() => {
    const schemas = new Set(documents.map(doc => doc.schema))
    return Array.from(schemas).sort()
  }, [documents])
  
  const handleAddTag = () => {
    if (newTag.trim() && !customTags.includes(newTag.trim())) {
      onTagAdd(newTag.trim())
      setNewTag('')
    }
  }
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddTag()
    }
  }
  
  return (
    <div className="h-full flex flex-col">
      <Tabs defaultValue="schemas" className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="schemas">Schemas</TabsTrigger>
          <TabsTrigger value="filters">Filters</TabsTrigger>
        </TabsList>
        
        <TabsContent value="schemas" className="flex-1 p-4 space-y-4 overflow-y-auto">
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Document Schemas
            </h4>
            
            {availableSchemas.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents available</p>
            ) : (
              <div className="space-y-2">
                {availableSchemas.map(schema => {
                  const count = documents.filter(doc => doc.schema === schema).length
                  const isSelected = selectedSchemas.has(schema)
                  
                  return (
                    <div 
                      key={schema}
                      className={cn(
                        "flex items-center justify-between p-2 rounded border cursor-pointer transition-colors",
                        isSelected ? "bg-primary/10 border-primary" : "hover:bg-muted"
                      )}
                      onClick={() => onSchemaToggle(schema)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" title={schema}>
                          {schema.split('/').pop() || schema}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {schema}
                        </div>
                      </div>
                      <Badge variant="secondary" className="ml-2">
                        {count}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Custom Tags
            </h4>
            
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Add custom tag..."
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1"
                />
                <Button 
                  size="sm" 
                  onClick={handleAddTag}
                  disabled={!newTag.trim() || customTags.includes(newTag.trim())}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              
              {customTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {customTags.map(tag => (
                    <Badge 
                      key={tag} 
                      variant="outline" 
                      className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => onTagRemove(tag)}
                    >
                      {tag}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="filters" className="flex-1 p-4 space-y-4 overflow-y-auto">
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Advanced Filters
            </h4>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="content-search" className="text-sm">Content Search</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="content-search"
                    placeholder="Search in document content..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <div className="text-sm text-muted-foreground">
                <p>Additional filter options will be available here in future updates:</p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-xs">
                  <li>Date range filters</li>
                  <li>File size filters</li>
                  <li>Document type filters</li>
                  <li>Custom metadata filters</li>
                </ul>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export function FileManager({
  tree,
  selectedPath,
  onPathSelect,
  documents,
  isLoadingDocuments,
  documentsTotalCount,
  onInsertPath,
  onRemovePath,
  onMovePath,
  onCopyPath,
  onMergeUp,
  onMergeDown,
  onSubtractUp,
  onSubtractDown,
  onRemoveDocument,
  onDeleteDocument,
  onRemoveDocuments,
  onDeleteDocuments,
  onCopyDocuments,
  onPasteDocuments,
  onImportDocuments,
  pastedDocumentIds,
  readOnly = false,
  contextPath,
  activeContextUrl,
  currentContextUrl
}: FileManagerProps) {
  const [selectedSchemas, setSelectedSchemas] = useState<Set<string>>(new Set())
  const [customTags, setCustomTags] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showRightPanel, setShowRightPanel] = useState(true)
  const { showToast } = useToast()
  
  // Filter documents based on selected schemas
  const filteredDocuments = useMemo(() => {
    if (selectedSchemas.size === 0) return documents
    return documents.filter(doc => selectedSchemas.has(doc.schema))
  }, [documents, selectedSchemas])
  
  const handleSchemaToggle = useCallback((schema: string) => {
    setSelectedSchemas(prev => {
      const newSet = new Set(prev)
      if (newSet.has(schema)) {
        newSet.delete(schema)
      } else {
        newSet.add(schema)
      }
      return newSet
    })
  }, [])
  
  const handleTagAdd = useCallback((tag: string) => {
    setCustomTags(prev => [...prev, tag])
    showToast({
      title: 'Success',
      description: 'Custom tag added',
      variant: 'default'
    })
  }, [showToast])
  
  const handleTagRemove = useCallback((tag: string) => {
    setCustomTags(prev => prev.filter(t => t !== tag))
    showToast({
      title: 'Success',
      description: 'Custom tag removed',
      variant: 'default'
    })
  }, [showToast])
  
  // Enhanced tree operations with additional file system methods
  const enhancedOnMergeUp = useCallback(async (path: string) => {
    if (!onMergeUp) return false
    try {
      const result = await onMergeUp(path)
      if (result) {
        showToast({
          title: 'Success',
          description: `Merged up: ${path}`,
          variant: 'default'
        })
      } else {
        showToast({
          title: 'Error',
          description: 'Failed to merge up',
          variant: 'destructive'
        })
      }
      return result
    } catch (error) {
      showToast({
        title: 'Error',
        description: `Error merging up: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive'
      })
      return false
    }
  }, [onMergeUp, showToast])
  
  const enhancedOnMergeDown = useCallback(async (path: string) => {
    if (!onMergeDown) return false
    try {
      const result = await onMergeDown(path)
      if (result) {
        showToast({
          title: 'Success',
          description: `Merged down: ${path}`,
          variant: 'default'
        })
      } else {
        showToast({
          title: 'Error',
          description: 'Failed to merge down',
          variant: 'destructive'
        })
      }
      return result
    } catch (error) {
      showToast({
        title: 'Error',
        description: `Error merging down: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive'
      })
      return false
    }
  }, [onMergeDown, showToast])
  
  return (
    <div className="h-full flex flex-col">
      {/* Header with actions */}
      <div className="border-b p-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Folders className="h-5 w-5" />
            File Manager
          </h2>
          <p className="text-sm text-muted-foreground">
            Navigate the context tree and manage documents
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRightPanel(!showRightPanel)}
            className="flex items-center gap-2"
          >
            <Filter className="h-4 w-4" />
            {showRightPanel ? 'Hide' : 'Show'} Filters
          </Button>
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left panel - Tree view */}
          <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
            <div className="h-full p-4 border-r">
              <TreeView
                tree={tree}
                selectedPath={selectedPath}
                onPathSelect={onPathSelect}
                readOnly={readOnly}
                title="Context Tree"
                onInsertPath={onInsertPath}
                onRemovePath={onRemovePath}
                onMovePath={onMovePath}
                onCopyPath={onCopyPath}
                onMergeUp={enhancedOnMergeUp}
                onMergeDown={enhancedOnMergeDown}
                onSubtractUp={onSubtractUp}
                onSubtractDown={onSubtractDown}
                onPasteDocuments={onPasteDocuments}
                pastedDocumentIds={pastedDocumentIds}
              />
            </div>
          </ResizablePanel>
          
          <ResizableHandle />
          
          {/* Center panel - Document view */}
          <ResizablePanel defaultSize={showRightPanel ? 50 : 75} minSize={40}>
            <div className="h-full p-4">
              <DocumentList
                documents={filteredDocuments}
                isLoading={isLoadingDocuments}
                contextPath={contextPath || selectedPath}
                totalCount={documentsTotalCount}
                onRemoveDocument={onRemoveDocument}
                onDeleteDocument={onDeleteDocument}
                onRemoveDocuments={onRemoveDocuments}
                onDeleteDocuments={onDeleteDocuments}
                onCopyDocuments={onCopyDocuments}
                onPasteDocuments={onPasteDocuments}
                onImportDocuments={onImportDocuments}
                pastedDocumentIds={pastedDocumentIds}
                viewMode="table"
                activeContextUrl={activeContextUrl}
                currentContextUrl={currentContextUrl}
              />
            </div>
          </ResizablePanel>
          
          {/* Right panel - Filters */}
          {showRightPanel && (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize={25} minSize={20} maxSize={35}>
                <div className="h-full border-l">
                  <FiltersPanel
                    documents={documents}
                    selectedSchemas={selectedSchemas}
                    onSchemaToggle={handleSchemaToggle}
                    customTags={customTags}
                    onTagAdd={handleTagAdd}
                    onTagRemove={handleTagRemove}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                  />
                </div>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  )
}

export default FileManager