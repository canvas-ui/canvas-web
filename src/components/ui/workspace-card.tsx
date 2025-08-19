import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { Button } from "./button";
import { Play, Square, DoorOpen, Trash2, Edit, MoreVertical, Move } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog";
import { useState, useCallback } from "react";
import { createPortal } from "react-dom";

interface WorkspaceCardProps {
  workspace: Workspace;
  onStart: (name: string) => void;
  onStop: (name: string) => void;
  onEnter: (name: string) => void;
  onEdit?: (workspace: Workspace) => void;
  onDestroy?: (workspace: Workspace) => void;
  onRemove?: (workspace: Workspace) => void;
  onDelete?: (workspace: Workspace) => void;
}

export function WorkspaceCard({ workspace, onStart, onStop, onEnter, onEdit, onDestroy, onRemove, onDelete }: WorkspaceCardProps) {
  const [isDestroyDialogOpen, setIsDestroyDialogOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const isActive = workspace.status === 'active';
  const isUniverse = workspace.type === 'universe' || workspace.name === 'universe';
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

  const handleRightClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  }, []);

  const handleContextMenuAction = useCallback((action: string) => {
    switch (action) {
      case 'remove':
        onRemove?.(workspace);
        break;
      case 'delete':
        onDelete?.(workspace);
        break;
    }
    setContextMenu(null);
  }, [workspace, onRemove, onDelete]);

  return (
    <>
      <Card className={`relative ${borderColorClass}`} style={borderStyle} onContextMenu={handleRightClick}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{workspace.label || workspace.name}</CardTitle>
            <CardDescription>{workspace.description}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {!isActive ? (
              <Button
                variant="outline"
                size="icon"
                onClick={() => onStart(workspace.name)}
                title="Start Workspace"
                disabled={isError || isNotFound}
              >
                <Play className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="icon"
                onClick={() => onStop(workspace.name)}
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
                onClick={() => onEnter(workspace.name)}
                title="Enter Workspace"
                disabled={isError || isNotFound}
              >
                <DoorOpen className="h-4 w-4" />
              </Button>
            )}

            {/* More Actions Menu */}
            {(onEdit || onDestroy) && !isUniverse && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    title="More actions"
                    disabled={isError || isNotFound}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onEdit && (
                    <DropdownMenuItem onClick={() => onEdit(workspace)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit Workspace
                    </DropdownMenuItem>
                  )}
                  {onEdit && onDestroy && <DropdownMenuSeparator />}
                  {onDestroy && (
                    <AlertDialog open={isDestroyDialogOpen} onOpenChange={setIsDestroyDialogOpen}>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={(e: Event) => {
                            e.preventDefault();
                            setIsDestroyDialogOpen(true);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Destroy Workspace
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Destroy Workspace</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to destroy the workspace "{workspace.label || workspace.name}"?
                            <br /><br />
                            <strong>This action cannot be undone.</strong> All data associated with this workspace, including documents, contexts, and configurations will be permanently removed.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              onDestroy(workspace);
                              setIsDestroyDialogOpen(false);
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Destroy Workspace
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
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

      {/* Context Menu */}
      {contextMenu && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div className="fixed z-50 bg-background border rounded-lg shadow-lg py-1 min-w-[120px]" style={{ left: contextMenu.x, top: contextMenu.y }}>
            {onRemove && !isUniverse && (
              <button className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2" onClick={() => handleContextMenuAction('remove')}>
                <Move className="h-3 w-3" />
                Remove
              </button>
            )}
            {onDelete && (
              <button className="w-full text-left px-3 py-1 hover:bg-muted text-sm flex items-center gap-2 text-destructive" onClick={() => handleContextMenuAction('delete')}>
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            )}
          </div>
        </>, document.body
      )}
    </>
  );
}
