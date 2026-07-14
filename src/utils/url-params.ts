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
  // Shared/pasted links arrive percent-encoded (e.g. N%C3%A1kup); decode each
  // segment so the path matches the decoded tree node names. In-app navigation
  // keeps the path decoded in router memory, which is why it only broke on load.
  const decode = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };
  const segments = pathname.split('/').filter(Boolean);
  // ['workspaces', wsName, 'trees', treeName, 'path', ...rest]
  // ['workspaces', wsName, 'path', ...rest]
  // ['workspaces', wsName]
  if (segments[0] !== 'workspaces') return { treeName: DEFAULT_TREE, path: '/' };

  if (segments[2] === 'trees' && segments[3]) {
    const treeName = decode(segments[3]);
    // /trees/:tree (no /path segment) is the named tree's root — buildWorkspaceUrl
    // omits the path segment for '/', so the parser must accept it or root clicks
    // on a named tree silently fall back to the default (context) tree.
    if (segments[4] !== 'path') {
      return { treeName, path: '/' };
    }
    const rest = segments.slice(5).map(decode).join('/');
    return { treeName, path: rest ? `/${rest}` : '/' };
  }

  if (segments[2] === 'path') {
    const rest = segments.slice(3).map(decode).join('/');
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
  const tree = treeName && treeName !== DEFAULT_TREE ? `/trees/${encodeURIComponent(treeName)}` : '';
  const p = sanitizeUrlPath(path);
  // Percent-encode each segment so non-ASCII / spaces / ':' survive the URL
  // intact. React Router v7 does NOT auto-decode the `*` splat, so readers must
  // decode (parseWorkspacePathFromUrl does; the workspace page does too). Without
  // encoding here, a raw non-ASCII path round-trips lossily — "Náš Domček" came
  // back "N Domek" (percent-escapes stripped, accents lost).
  const pathSegment = p === '/'
    ? ''
    : `/path/${p.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;
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
