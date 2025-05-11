import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { API_ROUTES } from '@/config/api';
import { useToast } from '@/components/ui/toast-container';

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
          <CardTitle>Workspace: {workspace.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <p>ID: {workspace.id}</p>
          <p>Description: {workspace.description}</p>
          <p>Owner: {workspace.owner}</p>
          <p>Status: {workspace.status}</p>
          <p>Type: {workspace.type || 'N/A'}</p>
          <p>Color: <span style={{ backgroundColor: workspace.color, padding: '0 0.5em', color: workspace.color ? 'white' : 'inherit' }}>{workspace.color || 'N/A'}</span></p>
          <p>Label: {workspace.label || 'N/A'}</p>
          <p>Created At: {new Date(workspace.createdAt).toLocaleString()}</p>
          <p>Updated At: {new Date(workspace.updatedAt).toLocaleString()}</p>
          {/* More details and functionality will go here */}
        </CardContent>
      </Card>
    </div>
  );
}
