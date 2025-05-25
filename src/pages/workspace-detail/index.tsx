import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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
    return <div className="text-center">Loading workspace details...</div>;
  }

  if (error) {
    return <div className="text-center text-destructive">Error: {error}</div>;
  }

  if (!workspace) {
    return <div className="text-center">Workspace not found.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight">{workspace.label}</h1>
        <p className="text-muted-foreground mt-2">{workspace.description || 'No description available'}</p>
      </div>

      {/* Workspace Details */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Basic Information</h2>
          <div className="space-y-3">
            <div>
              <span className="font-medium">ID:</span>
              <span className="ml-2 font-mono text-sm">{workspace.id}</span>
            </div>
            <div>
              <span className="font-medium">Owner:</span>
              <span className="ml-2">{workspace.owner}</span>
            </div>
            <div>
              <span className="font-medium">Type:</span>
              <span className="ml-2">{workspace.type || 'N/A'}</span>
            </div>
            <div>
              <span className="font-medium">Status:</span>
              <span className="ml-2">{workspace.status}</span>
            </div>
            <div className="flex items-center">
              <span className="font-medium">Color:</span>
              {workspace.color ? (
                <div className="ml-2 flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded border"
                    style={{ backgroundColor: workspace.color }}
                  />
                  <span className="font-mono text-sm">{workspace.color}</span>
                </div>
              ) : (
                <span className="ml-2 text-muted-foreground">No color set</span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">System Information</h2>
          <div className="space-y-3">
            <div>
              <span className="font-medium">Root Path:</span>
              <span className="ml-2 font-mono text-sm break-all">{workspace.rootPath}</span>
            </div>
            <div>
              <span className="font-medium">Config Path:</span>
              <span className="ml-2 font-mono text-sm break-all">{workspace.configPath}</span>
            </div>
            <div>
              <span className="font-medium">Created:</span>
              <span className="ml-2">{new Date(workspace.created).toLocaleString()}</span>
            </div>
            <div>
              <span className="font-medium">Updated:</span>
              <span className="ml-2">{new Date(workspace.updated).toLocaleString()}</span>
            </div>
            <div>
              <span className="font-medium">Last Accessed:</span>
              <span className="ml-2">{workspace.lastAccessed ? new Date(workspace.lastAccessed).toLocaleString() : 'Never'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Access Control */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Access Control</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="font-medium mb-2">Read-Write Access</h3>
            {workspace.acl.rw.length > 0 ? (
              <ul className="space-y-1">
                {workspace.acl.rw.map((user, index) => (
                  <li key={index} className="font-mono text-sm">{user}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">No users with read-write access</p>
            )}
          </div>
          <div>
            <h3 className="font-medium mb-2">Read-Only Access</h3>
            {workspace.acl.ro.length > 0 ? (
              <ul className="space-y-1">
                {workspace.acl.ro.map((user, index) => (
                  <li key={index} className="font-mono text-sm">{user}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">No users with read-only access</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
