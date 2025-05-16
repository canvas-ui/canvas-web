import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { API_ROUTES } from '@/config/api';
import { useToast } from '@/components/ui/toast-container';

interface Workspace {
  id: string;
  owner: string;
  type: string;
  label: string;
  color: string | null;
  description: string;
  acl: {
    rw: string[];
    ro: string[];
  };
  created: string;
  updated: string;
  rootPath: string;
  configPath: string;
  status: string;
  lastAccessed: string | null;
}

export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (!workspaceId) return;

    const fetchWorkspaceDetails = async () => {
      setIsLoading(true);
      try {
        const response = await api.get<ApiResponse<{ workspace: Workspace } | Workspace>>(`${API_ROUTES.workspaces}/${workspaceId}`);

        if (response.payload && 'workspace' in response.payload) {
          setWorkspace(response.payload.workspace as Workspace);
        } else {
          setWorkspace(response.payload as Workspace);
        }
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : `Failed to fetch workspace ${workspaceId}`;
        setError(message);
        setWorkspace(null);
        showToast({
          title: 'Error',
          description: message,
          variant: 'destructive'
        });
      }
      setIsLoading(false);
    };

    fetchWorkspaceDetails();
  }, [workspaceId, showToast]);

  if (isLoading) {
    return <div className="container mx-auto p-4 text-center">Loading workspace details...</div>;
  }

  if (error) {
    return <div className="container mx-auto p-4 text-center text-destructive">Error: {error}</div>;
  }

  if (!workspace) {
    return <div className="container mx-auto p-4 text-center">Workspace not found.</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Workspace: {workspace.label}</CardTitle>
        </CardHeader>
        <CardContent>
          <p><strong>ID:</strong> {workspace.id}</p>
          <p><strong>Label:</strong> {workspace.label}</p>
          <p><strong>Description:</strong> {workspace.description || 'N/A'}</p>
          <p><strong>Owner:</strong> {workspace.owner}</p>
          <p><strong>Status:</strong> {workspace.status}</p>
          <p><strong>Type:</strong> {workspace.type || 'N/A'}</p>
          <p><strong>Color:</strong> <span style={{ backgroundColor: workspace.color || undefined, padding: '0 0.5em', color: workspace.color ? 'white' : 'inherit', border: workspace.color ? '1px solid #ccc' : 'none' }}>{workspace.color || 'N/A'}</span></p>
          <p><strong>Root Path:</strong> {workspace.rootPath}</p>
          <p><strong>Config Path:</strong> {workspace.configPath}</p>
          <div>
            <strong>ACL:</strong>
            <ul>
              <li>Read-Write: {workspace.acl.rw.join(', ') || 'N/A'}</li>
              <li>Read-Only: {workspace.acl.ro.join(', ') || 'N/A'}</li>
            </ul>
          </div>
          <p><strong>Created At:</strong> {new Date(workspace.created).toLocaleString()}</p>
          <p><strong>Updated At:</strong> {new Date(workspace.updated).toLocaleString()}</p>
          <p><strong>Last Accessed:</strong> {workspace.lastAccessed ? new Date(workspace.lastAccessed).toLocaleString() : 'N/A'}</p>
          {/* More details and functionality will go here */}
        </CardContent>
      </Card>
    </div>
  );
}
