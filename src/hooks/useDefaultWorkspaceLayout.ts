import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

/**
 * Layout preselected in the create-workspace form. The server decides it
 * (CANVAS_WORKSPACE_LAYOUT — `home` in the container, `full` otherwise), so the
 * UI and an API call that omits `layout` agree on what "default" means.
 *
 * Returns `full` until the answer arrives; the form stays usable either way,
 * and a user change is never overwritten.
 */
export function useDefaultWorkspaceLayout(): [WorkspaceLayout, (layout: WorkspaceLayout) => void] {
  const [layout, setLayout] = useState<WorkspaceLayout>('full');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    let isMounted = true;
    api
      .get<{ payload?: { defaults?: { workspaceLayout?: WorkspaceLayout } } }>('/ping', { skipAuth: true })
      .then((response) => {
        const serverDefault = response.payload?.defaults?.workspaceLayout;
        if (isMounted && !touched && (serverDefault === 'home' || serverDefault === 'full')) {
          setLayout(serverDefault);
        }
      })
      .catch(() => { /* keep the built-in default */ });
    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [layout, (next: WorkspaceLayout) => { setTouched(true); setLayout(next); }];
}

export default useDefaultWorkspaceLayout;
