import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { Button } from "./button";
import { Play, Square, DoorOpen, Trash2, Edit } from "lucide-react";
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
import { useState } from "react";
import { visibleAccentColor } from "@/utils/color";

interface WorkspaceCardProps {
  workspace: Workspace;
  onStart: (name: string) => void;
  onStop: (name: string) => void;
  onEnter: (name: string) => void;
  onEdit?: (workspace: Workspace) => void;
  onDestroy?: (workspace: Workspace) => void;
}

export function WorkspaceCard({ workspace, onStart, onStop, onEnter, onEdit, onDestroy }: WorkspaceCardProps) {
  const [isDestroyDialogOpen, setIsDestroyDialogOpen] = useState(false);
  const isActive = workspace.status === 'active';
  const isUniverse = workspace.type === 'universe' || workspace.name === 'universe';
  const isError = workspace.status === 'error';
  const isNotFound = workspace.status === 'not_found';
  const isShared = (workspace as any).isShared === true || workspace.type === 'shared';
  const sharedFrom = (workspace as any).ownerEmail || workspace.owner;

  // Near-white workspace colors would vanish against the card background —
  // fall back to the neutral border in that case.
  const accent = visibleAccentColor(workspace.color);
  const borderColorClass = accent ? '' : 'border-border'; // Default border color
  const borderStyle = accent ? { borderLeftColor: accent, borderLeftWidth: '4px' } : { borderLeftWidth: '4px' };

  const getStatusColor = () => {
    switch (workspace.status) {
      case 'active':
        return 'bg-success';
      case 'inactive':
      case 'available':
        return 'bg-muted-foreground';
      case 'error':
        return 'bg-destructive';
      case 'not_found':
        return 'bg-muted-foreground';
      default:
        return 'bg-accent';
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
    <>
      <Card className={`relative ${borderColorClass}`} style={borderStyle}>
      <CardHeader>
        {/* Wraps on narrow screens: four icon buttons plus a title do not fit
            360px, and without `min-w-0` the title block refused to shrink, so
            the action group was pushed off the card and clipped — the Delete
            and Edit buttons were unreachable on a phone. */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 basis-40">
            <CardTitle className="truncate">{workspace.label || workspace.name}</CardTitle>
            <CardDescription>
              {isShared ? `Shared from ${sharedFrom}` : (workspace.description || '')}
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
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

            {/* Edit Button */}
            {onEdit && !isUniverse && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => onEdit(workspace)}
                title="Edit Workspace"
                disabled={isError || isNotFound}
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}

            {/* Destroy/Delete Button - enabled when workspace is stopped */}
            {onDestroy && !isUniverse && (
              <AlertDialog open={isDestroyDialogOpen} onOpenChange={setIsDestroyDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Delete Workspace"
                    disabled={isActive}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Workspace</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete the workspace "{workspace.label || workspace.name}"?
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
                      Delete Workspace
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
          {isShared && (
            <span className="ml-2 rounded-full bg-info/10 px-2 py-1 text-xs text-info">
              Shared
            </span>
          )}
        </div>
      </CardContent>
      </Card>
    </>
  );
}
