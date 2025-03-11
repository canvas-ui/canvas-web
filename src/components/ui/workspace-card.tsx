import type { FC } from 'react';
import { Card } from './card';
import { Button } from './button';

interface Workspace {
  id: string;
  name: string;
  description: string;
  color: string;
  status: 'initialized' | 'active' | 'inactive' | 'deleted';
}

interface WorkspaceCardProps {
  workspace: Workspace;
  onOpen?: (id: string) => void;
  onClose?: (id: string) => void;
  onRemove?: (id: string) => void;
  onPurge?: (id: string) => void;
}

export const WorkspaceCard: FC<WorkspaceCardProps> = ({ workspace, onOpen, onClose, onRemove, onPurge }) => {
  // Status badge styles based on status
  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      case 'deleted':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <Card className="relative">
      {/* Color indicator */}
      <div
        className="absolute left-0 top-0 w-2 h-full rounded-l-lg"
        style={{ backgroundColor: workspace.color }}
      />

      <div className="p-4 pl-6">
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-semibold">{workspace.name}</h3>
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeStyle(workspace.status)}`}>
            {workspace.status}
          </span>
        </div>

        <p className="text-sm text-gray-600 mt-1">{workspace.description}</p>

        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpen?.(workspace.id)}
            disabled={workspace.status === 'deleted'}
          >
            Open
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onClose?.(workspace.id)}
            disabled={workspace.status !== 'active'}
          >
            Close
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onRemove?.(workspace.id)}
            className="text-red-600 hover:bg-red-50"
            disabled={workspace.status === 'deleted'}
          >
            Remove
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPurge?.(workspace.id)}
            className="text-red-800 hover:bg-red-50"
          >
            Purge
          </Button>
        </div>
      </div>
    </Card>
  );
};
