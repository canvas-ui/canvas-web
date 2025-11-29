import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast-container';
import {
  getWorkspaceServicesStatus,
  enableWorkspaceService,
  disableWorkspaceService,
  WorkspaceServicesStatus
} from '@/services/workspace';
import {
  FolderGit2,
  HardDrive,
  ToggleLeft,
  ToggleRight,
  Loader2,
  CheckCircle2,
  XCircle
} from 'lucide-react';

interface ServicesPanelProps {
  workspaceId: string;
}

export function ServicesPanel({ workspaceId }: ServicesPanelProps) {
  const [services, setServices] = useState<WorkspaceServicesStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const { showToast } = useToast();

  const fetchServices = useCallback(async () => {
    try {
      const status = await getWorkspaceServicesStatus(workspaceId);
      setServices(status);
    } catch (err) {
      console.error('Failed to fetch services status:', err);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const handleToggleService = async (serviceName: 'dotfiles' | 'home', currentlyEnabled: boolean) => {
    setToggling(serviceName);
    try {
      if (currentlyEnabled) {
        await disableWorkspaceService(workspaceId, serviceName);
        showToast({
          title: 'Service Disabled',
          description: `${serviceName} service has been disabled`,
        });
      } else {
        await enableWorkspaceService(workspaceId, serviceName);
        showToast({
          title: 'Service Enabled',
          description: `${serviceName} service has been enabled`,
        });
      }
      await fetchServices();
    } catch (err) {
      showToast({
        title: 'Error',
        description: `Failed to toggle ${serviceName} service`,
        variant: 'destructive',
      });
    } finally {
      setToggling(null);
    }
  };

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading services...
        </div>
      </Card>
    );
  }

  if (!services) {
    return null;
  }

  const serviceItems = [
    {
      id: 'dotfiles',
      name: 'Dotfiles',
      description: 'Git-based dotfile synchronization across devices',
      icon: FolderGit2,
      status: services.dotfiles,
    },
    {
      id: 'home',
      name: 'Home',
      description: 'File storage with WebDAV access and auto-indexing',
      icon: HardDrive,
      status: services.home,
    },
  ] as const;

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold mb-4">Workspace Services</h3>
      <div className="space-y-4">
        {serviceItems.map((service) => {
          const Icon = service.icon;
          const isEnabled = service.status.enabled;
          const isToggling = toggling === service.id;

          return (
            <div
              key={service.id}
              className="flex items-center justify-between p-3 rounded-lg border bg-card"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${isEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{service.name}</span>
                    {service.status.initialized ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{service.description}</p>
                  {service.status.transports && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Transports: {service.status.transports.join(', ')}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant={isEnabled ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleToggleService(service.id, isEnabled)}
                disabled={isToggling}
              >
                {isToggling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isEnabled ? (
                  <>
                    <ToggleRight className="h-4 w-4 mr-1" />
                    Enabled
                  </>
                ) : (
                  <>
                    <ToggleLeft className="h-4 w-4 mr-1" />
                    Enable
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

