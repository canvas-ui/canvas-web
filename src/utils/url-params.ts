/**
 * Utilities for handling URL parameters for features and filters
 */

/**
 * Sanitize URL path by removing duplicate slashes and ensuring proper format
 */
export function sanitizeUrlPath(path: string): string {
  if (!path) return '/';

  // Replace multiple consecutive slashes with single slash
  const sanitized = path.replace(/\/+/g, '/');

  // Ensure path starts with slash
  return sanitized.startsWith('/') ? sanitized : `/${sanitized}`;
}

export interface UrlFilters {
  features: string[];
  filters: string[];
}

/**
 * Parse URL search parameters for features and filters
 */
export function parseUrlFilters(searchParams: URLSearchParams): UrlFilters {
  const features = searchParams.getAll('feature');
  const filters = searchParams.getAll('filter');

  return {
    features,
    filters
  };
}

/**
 * Convert filters object to URL search parameters
 */
export function filtersToUrlParams(filters: UrlFilters): URLSearchParams {
  const params = new URLSearchParams();

  filters.features.forEach(feature => {
    params.append('feature', feature);
  });

  filters.filters.forEach(filter => {
    params.append('filter', filter);
  });

  return params;
}

const DEFAULT_TREE = 'context';

/**
 * Parse tree name and path from workspace URL pathname.
 * Handles:
 *   /workspaces/:ws/trees/:tree/path[/rest...]
 *   /workspaces/:ws/path[/rest...]
 *   /workspaces/:ws
 */
export function parseWorkspacePathFromUrl(pathname: string): { treeName: string; path: string } {
  const segments = pathname.split('/').filter(Boolean);
  // ['workspaces', wsName, 'trees', treeName, 'path', ...rest]
  // ['workspaces', wsName, 'path', ...rest]
  // ['workspaces', wsName]
  if (segments[0] !== 'workspaces') return { treeName: DEFAULT_TREE, path: '/' };

  if (segments[2] === 'trees' && segments[4] === 'path') {
    const treeName = segments[3] || DEFAULT_TREE;
    const rest = segments.slice(5).join('/');
    return { treeName, path: rest ? `/${rest}` : '/' };
  }

  if (segments[2] === 'path') {
    const rest = segments.slice(3).join('/');
    return { treeName: DEFAULT_TREE, path: rest ? `/${rest}` : '/' };
  }

  return { treeName: DEFAULT_TREE, path: '/' };
}

/**
 * Build workspace URL.
 * /workspaces/:ws                              — root, default tree
 * /workspaces/:ws/path/foo/bar                 — path, default tree
 * /workspaces/:ws/trees/:tree                  — root, named tree
 * /workspaces/:ws/trees/:tree/path/foo/bar     — path, named tree
 */
export function buildWorkspaceUrl(workspaceName: string, path: string, treeName?: string): string {
  const tree = treeName && treeName !== DEFAULT_TREE ? `/trees/${treeName}` : '';
  const p = sanitizeUrlPath(path);
  const pathSegment = p === '/' ? '' : `/path${p}`;
  return `/workspaces/${workspaceName}${tree}${pathSegment}`;
}

/**
 * Extract workspace path from URL pathname (legacy helper).
 * e.g., /workspaces/myworkspace/path/foo/bar -> /foo/bar
 */
export function extractWorkspacePath(pathname: string): string {
  const { path } = parseWorkspacePathFromUrl(pathname);
  return path;
}

/**
 * Build context URL with filters
 */
export function buildContextUrl(contextId: string, filters?: UrlFilters): string {
  const basePath = `/contexts/${contextId}`;

  if (!filters || (filters.features.length === 0 && filters.filters.length === 0)) {
    return basePath;
  }

  const params = filtersToUrlParams(filters);
  return `${basePath}?${params.toString()}`;
}

/**
 * Parse feature filters for context toolbox
 */
export function parseFeatureFilters(features: string[]): {
  tabs: boolean;
  notes: boolean;
  todo: boolean;
  customBitmaps: string[];
} {
  const result = {
    tabs: false,
    notes: false,
    todo: false,
    customBitmaps: [] as string[]
  };

  features.forEach(feature => {
    switch (feature) {
      case 'data/abstraction/tab':
        result.tabs = true;
        break;
      case 'data/abstraction/note':
        result.notes = true;
        break;
      case 'data/abstraction/todo':
        result.todo = true;
        break;
      default:
        // Custom bitmap
        result.customBitmaps.push(feature);
        break;
    }
  });

  return result;
}

/**
 * Convert feature filters back to features array
 */
export function featureFiltersToArray(filters: {
  tabs: boolean;
  notes: boolean;
  todo: boolean;
  customBitmaps: string[];
}): string[] {
  const features: string[] = [];

  if (filters.tabs) features.push('data/abstraction/tab');
  if (filters.notes) features.push('data/abstraction/note');
  if (filters.todo) features.push('data/abstraction/todo');

  features.push(...filters.customBitmaps);

  return features;
}
