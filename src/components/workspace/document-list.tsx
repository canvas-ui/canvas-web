import { Document } from '@/types/workspace'
import { File, Calendar, Hash, Eye, ExternalLink, Globe, X, Trash2, Copy, Move } from 'lucide-react'
import { useState, useCallback } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'

interface DocumentListProps {
  documents: Document[]
  isLoading: boolean
  contextPath: string
  totalCount: number
  onRemoveDocument?: (documentId: number) => void
  onDeleteDocument?: (documentId: number) => void
  onRemoveDocuments?: (documentIds: number[]) => void
  onDeleteDocuments?: (documentIds: number[]) => void
  onCopyDocuments?: (documentIds: number[]) => void
  viewMode?: 'card' | 'table'
  activeContextUrl?: string
  currentContextUrl?: string
}

interface DocumentRowProps {
  document: Document
  isSelected?: boolean
  onSelect?: (documentId: number, isSelected: boolean, isCtrlClick: boolean) => void
  onRemoveDocument?: (documentId: number) => void
  onDeleteDocument?: (documentId: number) => void
}

interface DocumentTableRowProps {
  document: Document
  isSelected?: boolean
  onSelect?: (documentId: number, isSelected: boolean, isCtrlClick: boolean) => void
  onRemoveDocument?: (documentId: number) => void
  onDeleteDocument?: (documentId: number) => void
}

interface DocumentDetailModalProps {
  document: Document | null
  isOpen: boolean
  onClose: () => void
}

function DocumentDetailModal({ document, isOpen, onClose }: DocumentDetailModalProps) {
  if (!isOpen || !document) return null

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold">Document Details</h2>
              <p className="text-muted-foreground">ID: {document.id}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-sm"
              title="Close"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="space-y-6">
            {/* Basic Info */}
            <div>
              <h3 className="font-semibold mb-3">Basic Information</h3>
              <div className="grid gap-3 text-sm">
                <div>
                  <span className="font-medium">Schema:</span>
                  <span className="ml-2 font-mono">{document.schema}</span>
                </div>
                <div>
                  <span className="font-medium">Schema Version:</span>
                  <span className="ml-2">{document.schemaVersion}</span>
                </div>
                <div>
                  <span className="font-medium">Version:</span>
                  <span className="ml-2">{document.versionNumber} / {document.latestVersion}</span>
                </div>
                <div>
                  <span className="font-medium">Created:</span>
                  <span className="ml-2">{formatDate(document.createdAt)}</span>
                </div>
                <div>
                  <span className="font-medium">Updated:</span>
                  <span className="ml-2">{formatDate(document.updatedAt)}</span>
                </div>
              </div>
            </div>

            {/* Document Data */}
            <div>
              <h3 className="font-semibold mb-3">Document Data</h3>
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                {JSON.stringify(document.data, null, 2)}
              </pre>
            </div>

            {/* Metadata */}
            <div>
              <h3 className="font-semibold mb-3">Metadata</h3>
              <div className="grid gap-3 text-sm">
                <div>
                  <span className="font-medium">Content Type:</span>
                  <span className="ml-2">{document.metadata.contentType}</span>
                </div>
                <div>
                  <span className="font-medium">Content Encoding:</span>
                  <span className="ml-2">{document.metadata.contentEncoding}</span>
                </div>
                {document.metadata.dataPaths.length > 0 && (
                  <div>
                    <span className="font-medium">Data Paths:</span>
                    <div className="ml-2 mt-1">
                      {document.metadata.dataPaths.map((path, index) => (
                        <div key={index} className="font-mono text-xs">{path}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Checksums */}
            {document.checksumArray.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3">Checksums</h3>
                <div className="space-y-2">
                  {document.checksumArray.map((checksum, index) => {
                    const [algo, hash] = checksum.split('/')
                    return (
                      <div key={index} className="flex items-center gap-2 text-sm font-mono">
                        <span className="font-medium">{algo}:</span>
                        <span className="text-muted-foreground">{hash}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Index Options */}
            <div>
              <h3 className="font-semibold mb-3">Index Options</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="font-medium">Primary Checksum Algorithm:</span>
                  <span className="ml-2">{document.indexOptions.primaryChecksumAlgorithm}</span>
                </div>
                <div>
                  <span className="font-medium">FTS Search Fields:</span>
                  <div className="ml-2 mt-1">
                    {document.indexOptions.ftsSearchFields.map((field, index) => (
                      <span key={index} className="inline-block bg-muted px-2 py-1 rounded text-xs mr-2 mb-1">
                        {field}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="font-medium">Vector Embedding Fields:</span>
                  <div className="ml-2 mt-1">
                    {document.indexOptions.vectorEmbeddingFields.map((field, index) => (
                      <span key={index} className="inline-block bg-muted px-2 py-1 rounded text-xs mr-2 mb-1">
                        {field}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DocumentTableRow({ document, isSelected, onSelect, onRemoveDocument, onDeleteDocument }: DocumentTableRowProps) {
  const [showDetailModal, setShowDetailModal] = useState(false)

  // Check if this is a tab document
  const isTabDocument = document.schema === 'data/abstraction/tab'
  const tabUrl = isTabDocument ? document.data.url : null

  // Extract the main title/content fields from document data
  const getDisplayTitle = () => {
    if (document.data.title) return document.data.title
    if (document.data.name) return document.data.name
    if (document.data.filename) return document.data.filename
    if (isTabDocument && document.data.url) {
      try {
        const url = new URL(document.data.url)
        return url.hostname + url.pathname
      } catch {
        return document.data.url
      }
    }
    return `Document ${document.id}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getSchemaDisplayName = (schema: string) => {
    const parts = schema.split('/')
    return parts[parts.length - 1] || schema
  }

  const getPrimaryChecksum = () => {
    if (document.checksumArray && document.checksumArray.length > 0) {
      const primary = document.checksumArray.find(c =>
        c.startsWith(document.indexOptions?.primaryChecksumAlgorithm || 'sha1')
      )
      if (primary) {
        const [algo, hash] = primary.split('/')
        return { algo, hash: hash.substring(0, 8) + '...' }
      }
    }
    return null
  }

  const primaryChecksum = getPrimaryChecksum()

  const handleDocumentClick = (e: React.MouseEvent) => {
    const isCtrlClick = e.ctrlKey || e.metaKey

    if (onSelect) {
      // Handle selection
      onSelect(document.id, !isSelected, isCtrlClick)
    }

    // Only open URL/modal if it's not a ctrl+click (selection)
    if (!isCtrlClick) {
      if (isTabDocument && tabUrl) {
        window.open(tabUrl, '_blank', 'noopener,noreferrer')
      } else {
        setShowDetailModal(true)
      }
    }
  }

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (onSelect) {
      // Right click always selects the document if not already selected
      if (!isSelected) {
        onSelect(document.id, true, false)
      }
    }
  }

  const handleViewDetails = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowDetailModal(true)
  }

  const handleRemoveDocument = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onRemoveDocument) {
      onRemoveDocument(document.id)
    }
  }

  const handleDeleteDocument = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onDeleteDocument) {
      onDeleteDocument(document.id)
    }
  }

  return (
    <>
      <TableRow
        className={`cursor-pointer ${
          isSelected
            ? 'bg-blue-50 hover:bg-blue-100'
            : 'hover:bg-muted/50'
        }`}
        onClick={handleDocumentClick}
        onContextMenu={handleRightClick}
      >
        <TableCell className="w-12">
          {isTabDocument ? (
            <Globe className="h-4 w-4 text-blue-500" />
          ) : (
            <File className="h-4 w-4 text-blue-500" />
          )}
        </TableCell>
        <TableCell className="font-medium max-w-xs">
          <div className="flex items-center gap-2">
            <span className="truncate" title={getDisplayTitle()}>
              {getDisplayTitle()}
            </span>
            {isTabDocument && (
              <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            )}
          </div>
        </TableCell>
        <TableCell>
          <span className="px-2 py-1 text-xs bg-muted rounded border">
            {getSchemaDisplayName(document.schema)}
          </span>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {document.id}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {primaryChecksum && (
            <span className="font-mono" title={`${primaryChecksum.algo} checksum`}>
              {primaryChecksum.hash}
            </span>
          )}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {formatDate(document.createdAt)}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {document.versionNumber > 1 ? `v${document.versionNumber}` : ''}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleViewDetails}
              title="View document details"
            >
              <Eye className="h-4 w-4" />
            </Button>
            {onRemoveDocument && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveDocument}
                title="Remove document from context"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            {onDeleteDocument && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeleteDocument}
                title="Delete document permanently"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>

      <DocumentDetailModal
        document={document}
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
      />
    </>
  )
}

function DocumentRow({ document, isSelected, onSelect, onRemoveDocument, onDeleteDocument }: DocumentRowProps) {
  const [showDetailModal, setShowDetailModal] = useState(false)

  // Check if this is a tab document
  const isTabDocument = document.schema === 'data/abstraction/tab'
  const tabUrl = isTabDocument ? document.data.url : null

  // Extract the main title/content fields from document data
  const getDisplayTitle = () => {
    if (document.data.title) return document.data.title
    if (document.data.name) return document.data.name
    if (document.data.filename) return document.data.filename
    if (isTabDocument && document.data.url) {
      // For tabs, show a cleaned up URL as title
      try {
        const url = new URL(document.data.url)
        return url.hostname + url.pathname
      } catch {
        return document.data.url
      }
    }
    return `Document ${document.id}`
  }

  const getDisplayContent = () => {
    if (document.data.content) {
      const content = String(document.data.content)
      return content.length > 100 ? content.substring(0, 100) + '...' : content
    }
    if (document.data.description) return document.data.description
    if (document.data.summary) return document.data.summary
    if (isTabDocument && document.data.url) return `Tab: ${document.data.url}`
    return ''
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getSchemaDisplayName = (schema: string) => {
    const parts = schema.split('/')
    return parts[parts.length - 1] || schema
  }

  const getPrimaryChecksum = () => {
    if (document.checksumArray && document.checksumArray.length > 0) {
      const primary = document.checksumArray.find(c =>
        c.startsWith(document.indexOptions?.primaryChecksumAlgorithm || 'sha1')
      )
      if (primary) {
        const [algo, hash] = primary.split('/')
        return { algo, hash: hash.substring(0, 8) + '...' }
      }
    }
    return null
  }

  const primaryChecksum = getPrimaryChecksum()

  const handleDocumentClick = (e: React.MouseEvent) => {
    const isCtrlClick = e.ctrlKey || e.metaKey

    if (onSelect) {
      // Handle selection
      onSelect(document.id, !isSelected, isCtrlClick)
    }

    // Only open URL/modal if it's not a ctrl+click (selection)
    if (!isCtrlClick) {
      if (isTabDocument && tabUrl) {
        // For tabs, open the URL in a new window/tab
        window.open(tabUrl, '_blank', 'noopener,noreferrer')
      } else {
        // For other documents, show detail modal
        setShowDetailModal(true)
      }
    }
  }

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (onSelect) {
      // Right click always selects the document if not already selected
      if (!isSelected) {
        onSelect(document.id, true, false)
      }
    }
  }

  const handleViewDetails = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowDetailModal(true)
  }

  const handleRemoveDocument = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onRemoveDocument) {
      onRemoveDocument(document.id)
    }
  }

  const handleDeleteDocument = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onDeleteDocument) {
      onDeleteDocument(document.id)
    }
  }

  return (
    <>
      <div
        className={`border rounded-lg p-4 transition-colors cursor-pointer ${
          isSelected
            ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-200'
            : ''
        } ${
          isTabDocument && !isSelected
            ? 'hover:bg-blue-50 hover:border-blue-200'
            : !isSelected
            ? 'hover:bg-accent/50'
            : ''
        }`}
        onClick={handleDocumentClick}
        onContextMenu={handleRightClick}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-center gap-2 mb-2 overflow-hidden">
              {isTabDocument ? (
                <Globe className="h-4 w-4 text-blue-500 flex-shrink-0" />
              ) : (
                <File className="h-4 w-4 text-blue-500 flex-shrink-0" />
              )}
              <h4 className="font-medium truncate min-w-0 flex-1 max-w-[640px]" title={getDisplayTitle()}>
                {getDisplayTitle()}
              </h4>
              {isTabDocument && (
                <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              )}
              <span className="px-2 py-0.5 text-xs bg-muted text-muted-foreground rounded border flex-shrink-0">
                {getSchemaDisplayName(document.schema)}
              </span>
            </div>

            {/* Content preview */}
            {getDisplayContent() && (
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2 break-all overflow-hidden">
                {getDisplayContent()}
              </p>
            )}

            {/* Metadata row */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground overflow-hidden">
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="font-medium">ID:</span>
                <span className="font-mono truncate max-w-[60px]" title={`ID: ${document.id}`}>{document.id}</span>
              </div>

              {primaryChecksum && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Hash className="h-3 w-3" />
                  <span className="font-mono" title={`${primaryChecksum.algo} checksum`}>
                    {primaryChecksum.hash}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-1 flex-shrink-0">
                <Calendar className="h-3 w-3" />
                <span title={`Created: ${formatDate(document.createdAt)}`}>
                  {formatDate(document.createdAt)}
                </span>
              </div>

              {document.versionNumber > 1 && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="font-medium">v{document.versionNumber}</span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleViewDetails}
              className="p-1 hover:bg-muted rounded-sm"
              title="View document details"
            >
              <Eye className="h-4 w-4" />
            </button>

            {/* Context-specific actions */}
            {onRemoveDocument && (
              <button
                onClick={handleRemoveDocument}
                className="p-1 hover:bg-muted rounded-sm"
                title="Remove document from context (keep in database)"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {onDeleteDocument && (
              <button
                onClick={handleDeleteDocument}
                className="p-1 hover:bg-destructive hover:text-destructive-foreground rounded-sm text-destructive"
                title="Delete document permanently from database"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Document Detail Modal */}
      <DocumentDetailModal
        document={document}
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
      />
    </>
  )
}

export function DocumentList({
  documents,
  isLoading,
  contextPath,
  totalCount,
  onRemoveDocument,
  onDeleteDocument,
  onRemoveDocuments,
  onDeleteDocuments,
  onCopyDocuments,
  viewMode = 'card',
  activeContextUrl,
  currentContextUrl
}: DocumentListProps) {
  const [selectedDocuments, setSelectedDocuments] = useState<Set<number>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; documentIds: number[] } | null>(null)

  const handleDocumentSelect = useCallback((documentId: number, isSelected: boolean, isCtrlClick: boolean) => {
    setSelectedDocuments(prev => {
      const newSelection = new Set(prev)

      if (isCtrlClick) {
        // Ctrl+click: toggle selection
        if (isSelected) {
          newSelection.add(documentId)
        } else {
          newSelection.delete(documentId)
        }
      } else {
        // Regular click: select only this document
        newSelection.clear()
        if (isSelected) {
          newSelection.add(documentId)
        }
      }

      return newSelection
    })
  }, [])

  const handleDocumentRightClick = useCallback((event: React.MouseEvent, documentId: number) => {
    event.preventDefault()

    // If the right-clicked document is not selected, select it and clear others
    let targetIds: number[]
    if (selectedDocuments.has(documentId)) {
      // Right-clicked on a selected document, use all selected
      targetIds = Array.from(selectedDocuments)
    } else {
      // Right-clicked on unselected document, select only this one
      targetIds = [documentId]
      setSelectedDocuments(new Set([documentId]))
    }

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      documentIds: targetIds
    })
  }, [selectedDocuments])

  const handleContextMenuAction = useCallback((action: string, documentIds: number[]) => {
    switch (action) {
      case 'copy':
        onCopyDocuments?.(documentIds)
        break
      case 'remove':
        if (documentIds.length === 1) {
          onRemoveDocument?.(documentIds[0])
        } else {
          onRemoveDocuments?.(documentIds)
        }
        break
      case 'delete':
        if (documentIds.length === 1) {
          onDeleteDocument?.(documentIds[0])
        } else {
          onDeleteDocuments?.(documentIds)
        }
        break
    }
    setContextMenu(null)
    setSelectedDocuments(new Set())
  }, [onCopyDocuments, onRemoveDocument, onRemoveDocuments, onDeleteDocument, onDeleteDocuments])
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading documents...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="border-b pb-3 mb-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm text-muted-foreground">Documents</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Context: <span className="font-mono">{contextPath}</span>
              {activeContextUrl && currentContextUrl && activeContextUrl !== currentContextUrl && (
                <span className="text-orange-600 ml-2">(not yet active)</span>
              )}
            </p>
            {selectedDocuments.size > 0 && (
              <p className="text-xs text-blue-600 mt-1">
                {selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">{documents.length} documents</p>
            {totalCount > documents.length && (
              <p className="text-xs text-muted-foreground">
                {totalCount} total (showing first {documents.length})
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Document list */}
      {documents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <File className="h-12 w-12 text-muted-foreground/50 mx-auto" />
            <p className="text-sm text-muted-foreground">
              No documents found in this context
            </p>
            <p className="text-xs text-muted-foreground">
              Path: <span className="font-mono">{contextPath}</span>
            </p>
          </div>
        </div>
      ) : viewMode === 'table' ? (
        <div className="flex-1 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Schema</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Checksum</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((document) => (
                <DocumentTableRow
                  key={document.id}
                  document={document}
                  isSelected={selectedDocuments.has(document.id)}
                  onSelect={handleDocumentSelect}
                  onRemoveDocument={onRemoveDocument}
                  onDeleteDocument={onDeleteDocument}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-3 pr-2">
            {documents.map((document) => (
              <div
                key={document.id}
                onContextMenu={(e) => handleDocumentRightClick(e, document.id)}
              >
                <DocumentRow
                  document={document}
                  isSelected={selectedDocuments.has(document.id)}
                  onSelect={handleDocumentSelect}
                  onRemoveDocument={onRemoveDocument}
                  onDeleteDocument={onDeleteDocument}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-50 bg-background border rounded-lg shadow-lg py-1 min-w-[120px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2"
              onClick={() => handleContextMenuAction('copy', contextMenu.documentIds)}
            >
              <Copy className="h-3 w-3" />
              Copy {contextMenu.documentIds.length > 1 ? `(${contextMenu.documentIds.length})` : ''}
            </button>
            <button
              className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2"
              onClick={() => handleContextMenuAction('remove', contextMenu.documentIds)}
            >
              <Move className="h-3 w-3" />
              Remove {contextMenu.documentIds.length > 1 ? `(${contextMenu.documentIds.length})` : ''}
            </button>
            <button
              className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2 text-destructive"
              onClick={() => handleContextMenuAction('delete', contextMenu.documentIds)}
            >
              <Trash2 className="h-3 w-3" />
              Delete {contextMenu.documentIds.length > 1 ? `(${contextMenu.documentIds.length})` : ''}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
