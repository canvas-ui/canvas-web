import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { API_ROUTES } from '@/config/api';
import { useToast } from '@/components/ui/toast-container';
import { Button } from '@/components/ui/button';
import { TreeView } from '@/components/common/tree-view';
import { DocumentList } from '@/components/workspace/document-list';
import { TokenManager } from '@/components/workspace/token-manager';
import { getWorkspaceTree, getWorkspaceDocuments } from '@/services/workspace';
import { getSchemas, getSchemaDisplayName } from '@/services/schemas';
import { TreeNode, Document, DocumentsResponse } from '@/types/workspace';

// Using global Workspace interface from types/api.d.ts

export default function WorkspaceDetailPage() {
  const { workspaceName } = useParams<{ workspaceName: string }>();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('/');
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [isLoadingTree, setIsLoadingTree] = useState(true);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentsTotalCount, setDocumentsTotalCount] = useState(0);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [selectedSchemas, setSelectedSchemas] = useState<string[]>([]);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [rightTab, setRightTab] = useState<'filter' | 'tokens'>('tokens');
  const { showToast } = useToast();

  // Fetch workspace details
  useEffect(() => {
    if (!workspaceName) return;

    const fetchWorkspace = async () => {
      setIsLoadingWorkspace(true);
      try {
        const response = await api.get<ApiResponse<{ workspace: Workspace } | Workspace>>(`${API_ROUTES.workspaces}/${workspaceName}`);

        if (response.payload && 'workspace' in response.payload) {
          setWorkspace(response.payload.workspace as Workspace);
        } else {
          setWorkspace(response.payload as Workspace);
        }
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : `Failed to fetch workspace ${workspaceName}`;
        setError(message);
        setWorkspace(null);
        showToast({
          title: 'Error',
          description: message,
          variant: 'destructive'
        });
      } finally {
        setIsLoadingWorkspace(false);
      }
    };

    fetchWorkspace();
  }, [workspaceName]);

  // Fetch workspace tree
  useEffect(() => {
    if (!workspaceName) return;

    const fetchTree = async () => {
      setIsLoadingTree(true);
      try {
        const response = await getWorkspaceTree(workspaceName);
        setTree(response.payload as TreeNode);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch workspace tree';
        setError(message);
        showToast({
          title: 'Error',
          description: message,
          variant: 'destructive'
        });
      } finally {
        setIsLoadingTree(false);
      }
    };

    fetchTree();
  }, [workspaceName]);

  // Load schemas for filtering
  useEffect(() => {
    const loadSchemas = async () => {
      try {
        setIsLoadingSchemas(true);
        const schemasData = await getSchemas();
        setSchemas(schemasData);
      } catch (err) {
        console.error('Failed to load schemas:', err);
      } finally {
        setIsLoadingSchemas(false);
      }
    };
    loadSchemas();
  }, []);

  // Fetch documents when path or schema filters change
  useEffect(() => {
    if (!workspaceName) return;

    const fetchDocuments = async () => {
      setIsLoadingDocuments(true);
      try {
        const response = await getWorkspaceDocuments(workspaceName, selectedPath, selectedSchemas);
        const documentsData = response.payload as DocumentsResponse;
        setDocuments(documentsData.data || []);
        setDocumentsTotalCount(documentsData.count || 0);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch documents';
        showToast({
          title: 'Error',
          description: message,
          variant: 'destructive'
        });
        setDocuments([]);
        setDocumentsTotalCount(0);
      } finally {
        setIsLoadingDocuments(false);
      }
    };

    fetchDocuments();
  }, [workspaceName, selectedPath, selectedSchemas]);

  const handlePathSelect = (path: string) => {
    setSelectedPath(path);
  };

  const handleRemoveDocument = async (documentId: number) => {
    try {
      // TODO: Implement API call to remove document from workspace context
      // await removeDocumentFromWorkspace(workspaceName!, documentId, selectedPath);

      // For now, just remove from local state
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      setDocumentsTotalCount(prev => Math.max(0, prev - 1));

      showToast({
        title: 'Success',
        description: 'Document removed from workspace context.'
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove document';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
    }
  };

  const handleDeleteDocument = async (documentId: number) => {
    try {
      // TODO: Implement API call to permanently delete document
      // await deleteDocument(documentId);

      // For now, just remove from local state
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      setDocumentsTotalCount(prev => Math.max(0, prev - 1));

      showToast({
        title: 'Success',
        description: 'Document deleted permanently.'
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete document';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
    }
  };

  if (isLoadingWorkspace) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (error && !workspace) {
    return (
      <div className="text-center space-y-4">
        <div className="text-destructive">Error: {error}</div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!workspace) {
    return <div className="text-center">Workspace not found.</div>;
  }

  return (
    <div className="flex h-full gap-6">

      {/* Main content */}
      <div className="flex-1 space-y-6">
        {/* Page Header */}
        <div className="border-b pb-4">
          <h1 className="text-3xl font-bold tracking-tight">{workspace.label}</h1>
          <p className="text-muted-foreground mt-2">{workspace.description || 'No description available'}</p>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span>Status: <span className="font-mono">{workspace.status}</span></span>
            <span>Owner: {workspace.owner}</span>
            {workspace.color && (
              <div className="flex items-center gap-2">
                <span>Color:</span>
                <div
                  className="w-4 h-4 rounded border"
                  style={{ backgroundColor: workspace.color }}
                />
                <span className="font-mono text-xs">{workspace.color}</span>
              </div>
            )}
          </div>
        </div>

        {/* File Manager Layout */}
        <div className="flex gap-6 h-[calc(100vh-300px)]">
          {/* Left Panel - Tree View */}
          <div className="w-80 border rounded-lg p-4 overflow-y-auto bg-card">
            {isLoadingTree ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-center space-y-2">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                  <p className="text-xs text-muted-foreground">Loading tree...</p>
                </div>
              </div>
            ) : tree ? (
              <TreeView
                tree={tree}
                selectedPath={selectedPath}
                onPathSelect={handlePathSelect}
                readOnly={true}
                title="Workspace Tree"
                subtitle="Click to navigate the workspace structure (read-only)"
              />
            ) : (
              <div className="text-center text-muted-foreground text-sm">
                Failed to load workspace tree
              </div>
            )}
          </div>

          {/* Right Panel - Document List */}
          <div className="flex-1 border rounded-lg p-4 bg-card flex flex-col min-h-0">
            <DocumentList
              documents={documents}
              isLoading={isLoadingDocuments}
              contextPath={selectedPath}
              totalCount={documentsTotalCount}
              viewMode="table"
              onRemoveDocument={handleRemoveDocument}
              onDeleteDocument={handleDeleteDocument}
            />
          </div>
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-80 border rounded-lg p-4 bg-card">
        <div className="flex border-b mb-4">
          <button
            className={`flex-1 py-2 text-sm font-medium ${rightTab === 'tokens' ? 'border-b-2 border-primary' : ''}`}
            onClick={() => setRightTab('tokens')}
          >
            Tokens
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium ${rightTab === 'filter' ? 'border-b-2 border-primary' : ''}`}
            onClick={() => setRightTab('filter')}
          >
            Filter
          </button>
        </div>

        {rightTab === 'tokens' ? (
          <TokenManager workspaceId={workspaceName!} />
        ) : (
          <div>
            <h3 className="text-lg font-semibold mb-4">Filter by Schema</h3>
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
                          setSelectedSchemas(prev => [...prev, schema])
                        } else {
                          setSelectedSchemas(prev => prev.filter(s => s !== schema))
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
                    onClick={() => setSelectedSchemas([])}
                    className="w-full mt-2"
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
