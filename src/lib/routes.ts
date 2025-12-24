/**
 * Canonical routes - single source of truth for all URL paths.
 * 
 * Rules:
 * - Usernames are the public identifier (/{username})
 * - Internal IDs never appear in public URLs
 * - One canonical route per concept
 */

// =============================================================================
// Route Constants
// =============================================================================

export const ROUTES = {
  HOME: '/',
  NEW: '/new',
  EDIT: '/edit',
} as const;

export const AUTH_ROUTES = {
  GOOGLE: '/api/auth/google',
  GOOGLE_CALLBACK: '/api/auth/google/callback',
  LOGOUT: '/api/auth/logout',
  STATUS: '/api/me',
} as const;

export const API_ROUTES = {
  ME: '/api/me',
  PUBLISH: '/api/publish',
  UPLOAD: '/api/upload',
  HEALTH: '/api/healthz',
} as const;

// Reserved paths that should NOT be treated as usernames
export const RESERVED_PATHS = new Set([
  'edit',
  'api',
  'auth',
  'graphql',
  'health',
  '_next',
  'static',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'p',
  'u',
  'onboarding',
  // Reserved for future use
  'admin',
  'settings',
  'login',
  'logout',
  'signup',
  'register',
  'terms',
  'privacy',
  'about',
  'help',
  'support',
  'blog',
  'docs',
  'null',
  'undefined',
  'new',
  'create',
  'me',
  'public',
  'assets',
]);

// =============================================================================
// Route Builders
// =============================================================================

/**
 * Route options for adding query parameters
 */
interface RouteOptions {
  /** Force fresh start (e.g., after logout) */
  fresh?: boolean;
}

/**
 * Routes object - use these to generate all internal links.
 * NEVER hardcode route strings - always use these builders.
 */
export const routes = {
  /** 
   * Home page - smart redirects to /edit (logged in) or /new (logged out)
   */
  home: (options?: RouteOptions) => {
    if (options?.fresh) {
      return `${ROUTES.HOME}?fresh=1`;
    }
    return ROUTES.HOME;
  },
  
  /**
   * New page - creates a draft and redirects to /edit/[pageId]
   * @param options.fresh - Force create a new page with fresh starter content
   */
  new: (options?: RouteOptions) => {
    if (options?.fresh) {
      return `${ROUTES.NEW}?fresh=1`;
    }
    return ROUTES.NEW;
  },
  
  /** 
   * Edit page - resolves user's primary page and redirects to /edit/[pageId]
   * If pageId is provided, goes directly to /edit/[pageId]
   */
  edit: (pageIdOrOptions?: string | RouteOptions) => {
    // Handle overloaded signature
    if (typeof pageIdOrOptions === 'object') {
      // Called with options only
      if (pageIdOrOptions?.fresh) {
        return `${ROUTES.EDIT}?fresh=1`;
      }
      return ROUTES.EDIT;
    }
    
    // Called with pageId
    if (pageIdOrOptions) {
      return `${ROUTES.EDIT}/${pageIdOrOptions}`;
    }
    return ROUTES.EDIT;
  },
  
  /**
   * Edit a specific page by ID - /edit/[pageId]
   * This is the canonical editor URL.
   */
  editPage: (pageId: string, options?: { publish?: boolean }) => {
    const base = `${ROUTES.EDIT}/${pageId}`;
    if (options?.publish) {
      return `${base}?publish=1`;
    }
    return base;
  },
  
  /**
   * User's public profile page - /{username}
   * This is the canonical public URL for viewing a user's page.
   */
  user: (username: string) => `/${username.toLowerCase()}`,
  
  /**
   * Alias for user() - semantic name for public profile
   */
  profile: (username: string) => routes.user(username),
} as const;

/**
 * Auth routes - for authentication flows
 */
export const auth = {
  /** Start Google OAuth flow */
  google: (returnTo?: string) => {
    if (returnTo) {
      return `${AUTH_ROUTES.GOOGLE}?returnTo=${encodeURIComponent(returnTo)}`;
    }
    return AUTH_ROUTES.GOOGLE;
  },
  
  /** Logout endpoint */
  logout: () => AUTH_ROUTES.LOGOUT,
  
  /** Auth status check */
  status: () => AUTH_ROUTES.STATUS,
} as const;

/**
 * API routes - for backend endpoints
 */
export const api = {
  me: () => API_ROUTES.ME,
  publish: () => API_ROUTES.PUBLISH,
  upload: () => API_ROUTES.UPLOAD,
  health: () => API_ROUTES.HEALTH,
  assetsHealth: () => '/api/assets/health',
} as const;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if an ID is a local draft ID (not persisted to server)
 */
export function isDraftId(id: string): boolean {
  return id.startsWith('draft_');
}

/**
 * Check if a URL is external (absolute URL)
 */
export function isExternalUrl(url: string): boolean {
  return /^(https?:)?\/\//.test(url) || url.startsWith('//');
}

/**
 * Normalize a path - lowercase, remove trailing slashes, remove duplicate slashes
 */
export function normalizePath(path: string): string {
  // Separate query string if present
  const [pathPart, query] = path.split('?');
  
  // Normalize the path part
  let normalized = pathPart
    .toLowerCase()
    .replace(/\/+/g, '/') // Remove duplicate slashes
    .replace(/\/$/, ''); // Remove trailing slash
  
  // Keep root slash
  if (normalized === '') normalized = '/';
  
  // Re-attach query string (preserve original casing)
  return query ? `${normalized}?${query}` : normalized;
}

/**
 * Join path segments into a clean path
 */
export function joinPath(...segments: string[]): string {
  const joined = segments
    .map(s => s.replace(/^\/+|\/+$/g, '')) // Remove leading/trailing slashes
    .filter(Boolean)
    .join('/');
  return '/' + joined;
}

/**
 * Encode a path segment for use in URLs
 */
export function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment);
}

// =============================================================================
// Username Validation
// =============================================================================

const USERNAME_REGEX = /^[a-z0-9_-]{3,20}$/;

/**
 * Check if a username is reserved (system paths that cannot be usernames)
 */
export function isReservedUsername(username: string): boolean {
  return RESERVED_PATHS.has(username.toLowerCase());
}

/**
 * Check if a username is valid (format only, not availability)
 */
export function isValidUsername(username: string): boolean {
  if (!USERNAME_REGEX.test(username)) return false;
  if (RESERVED_PATHS.has(username)) return false;
  return true;
}

/**
 * Get error message for invalid username, or null if valid
 */
export function getUsernameError(username: string): string | null {
  if (!username) return 'Username is required';
  if (username.length < 3) return 'Username must be at least 3 characters';
  if (username.length > 20) return 'Username must be 20 characters or less';
  if (!/^[a-z0-9_-]+$/.test(username)) return 'Only lowercase letters, numbers, underscores, and hyphens';
  if (RESERVED_PATHS.has(username)) return 'This username is reserved';
  return null;
}

// =============================================================================
// Server-side Helpers
// =============================================================================

/**
 * Build the public URL path for a user's page (server-side)
 */
export function buildPublicPath(username: string): string {
  return routes.user(username);
}

/**
 * Get absolute URL for a path (client-side only)
 */
export function getAbsoluteUrl(path: string): string {
  // Check if we're in a browser environment
  if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
    const win = globalThis as unknown as { window: { location: { origin: string } } };
    return `${win.window.location.origin}${path}`;
  }
  return path;
}

/**
 * @deprecated Use routes.user(username) instead
 * Legacy function - kept for backward compatibility during migration
 */
export function getPublicUrl(pageId: string, username?: string): string {
  if (username) {
    return getAbsoluteUrl(routes.user(username));
  }
  // Fallback for pages without username - this should not happen in normal flow
  if (typeof console !== 'undefined') {
    console.warn('[routes] getPublicUrl called without username - this is deprecated');
  }
  return getAbsoluteUrl(`/p/${pageId}`);
}

// =============================================================================
// Parse Helpers
// =============================================================================

/**
 * Parse username from a root-level path
 * Returns null for reserved paths or invalid paths
 */
export function parseUsername(path: string): string | null {
  const normalized = normalizePath(path);
  
  // Must be a root-level path like /username
  if (!normalized.startsWith('/')) return null;
  
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length !== 1) return null;
  
  const username = segments[0];
  
  // Check if it's a reserved path
  if (RESERVED_PATHS.has(username)) return null;
  
  // Basic format validation
  if (!USERNAME_REGEX.test(username)) return null;
  
  return username;
}
