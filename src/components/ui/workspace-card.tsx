import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { Button } from "./button";
import { Play, Square, DoorOpen } from "lucide-react";

interface WorkspaceCardProps {
  workspace: Workspace;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onEnter: (id: string) => void;
}

export function WorkspaceCard({ workspace, onStart, onStop, onEnter }: WorkspaceCardProps) {
  const isActive = workspace.status === 'active';
  const isUniverse = workspace.type === 'universe' || workspace.id === 'universe';
  const isError = workspace.status === 'error';
  const isNotFound = workspace.status === 'not_found';

  const borderColorClass = workspace.color ? '' : 'border-slate-300'; // Default border color
  const borderStyle = workspace.color ? { borderLeftColor: workspace.color, borderLeftWidth: '4px' } : { borderLeftWidth: '4px' };

  const getStatusColor = () => {
    switch (workspace.status) {
      case 'active':
        return 'bg-green-500';
      case 'inactive':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      case 'not_found':
        return 'bg-gray-500';
      default:
        return 'bg-gray-300';
    }
  };

  const getStatusText = () => {
    switch (workspace.status) {
      case 'active':
        return 'Active';
      case 'inactive':
        return 'Inactive';
      case 'error':
        return 'Error';
      case 'not_found':
        return 'Not Found';
      case 'available':
        return 'Available';
      case 'removed':
        return 'Removed';
      case 'destroyed':
        return 'Destroyed';
      default:
        return workspace.status;
    }
  };

  return (
    <Card className={`relative ${borderColorClass}`} style={borderStyle}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{workspace.name}</CardTitle>
            <CardDescription>{workspace.description}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {!isActive ? (
              <Button
                variant="outline"
                size="icon"
                onClick={() => onStart(workspace.id)}
                title="Start Workspace"
                disabled={isError || isNotFound}
              >
                <Play className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="icon"
                onClick={() => onStop(workspace.id)}
                title="Stop Workspace"
                disabled={isError || isNotFound}
              >
                <Square className="h-4 w-4" />
              </Button>
            )}
            {isActive && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => onEnter(workspace.id)}
                title="Enter Workspace"
                disabled={isError || isNotFound}
              >
                <DoorOpen className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <div
            className={`h-3 w-3 rounded-full ${getStatusColor()}`}
          />
          <span className="text-sm text-muted-foreground">
            {getStatusText()}
          </span>
          {isUniverse && (
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
              Universe
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
