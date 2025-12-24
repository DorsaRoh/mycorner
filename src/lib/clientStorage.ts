/**
 * Client-side storage management with schema versioning.
 * 
 * This module provides:
 * 1. Schema versioning for localStorage to handle migrations
 * 2. Safe JSON parsing that never throws
 * 3. Automatic cleanup of stale/invalid storage on version mismatch
 * 4. Boot diagnostics logging
 * 
 * STORAGE SCHEMA:
 * - yourcorner:storage_version - Current schema version
 * - yourcorner:draft:v1 - Draft page data
 * - yourcorner:* - All app-related keys
 * 
 * When STORAGE_VERSION changes, all yourcorner:* keys except drafts
 * are cleared to ensure clean state.
 */

// =============================================================================
// Configuration
// =============================================================================

/**
 * Current storage schema version.
 * Increment this when storage format changes in incompatible ways.
 * 
 * History:
 * - 1: Initial version
 * - 2: Fixed routing/auth issues, cleaned up legacy state
 * - 3: Fixed infinite redirect loop in /edit - stale cookie vs query param issue
 */
export const STORAGE_VERSION = 3;

const STORAGE_VERSION_KEY = 'yourcorner:storage_version';

/**
 * Keys that are safe to preserve across version upgrades.
 * Draft data is valuable, so we try to keep it.
 */
const PRESERVE_KEYS = [
  'yourcorner:draft:v1',
];

/**
 * Key prefixes that belong to this app.
 */
const APP_KEY_PREFIXES = [
  'yourcorner:',
  'mycorner:',
];

// =============================================================================
// Safe JSON Parsing
// =============================================================================

/**
 * Safely parse JSON without throwing.
 * Returns null for invalid JSON or non-string input.
 */
export function safeJsonParse<T = unknown>(json: string | null | undefined): T | null {
  if (json == null || typeof json !== 'string') {
    return null;
  }
  
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Safely get an item from localStorage.
 * Returns null if not available or on error.
 */
export function safeGetItem(key: string): string | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }
  
  try {
    return localStorage.getItem(key);
  } catch {
    // Can happen in private browsing or when storage is full
    return null;
  }
}

/**
 * Safely set an item in localStorage.
 * Returns false if failed.
 */
export function safeSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return false;
  }
  
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    // Can happen in private browsing or when storage is full
    return false;
  }
}

/**
 * Safely remove an item from localStorage.
 * Returns false if failed.
 */
export function safeRemoveItem(key: string): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return false;
  }
  
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Storage Version Management
// =============================================================================

/**
 * Get the current storage version.
 * Returns 0 if not set or invalid.
 */
export function getStorageVersion(): number {
  const stored = safeGetItem(STORAGE_VERSION_KEY);
  if (!stored) return 0;
  
  const version = parseInt(stored, 10);
  return isNaN(version) ? 0 : version;
}

/**
 * Set the storage version.
 */
export function setStorageVersion(version: number): boolean {
  return safeSetItem(STORAGE_VERSION_KEY, String(version));
}

// =============================================================================
// Storage Cleanup
// =============================================================================

/**
 * Clear all app-related storage, optionally preserving drafts.
 */
export function clearAppStorage(options?: { preserveDraft?: boolean }): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  
  const preserveDraft = options?.preserveDraft ?? true;
  const keysToRemove: string[] = [];
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      
      // Check if this key belongs to our app
      const isAppKey = APP_KEY_PREFIXES.some(prefix => key.startsWith(prefix));
      if (!isAppKey) continue;
      
      // Check if we should preserve this key
      if (preserveDraft && PRESERVE_KEYS.includes(key)) {
        continue;
      }
      
      keysToRemove.push(key);
    }
    
    // Remove collected keys
    for (const key of keysToRemove) {
      safeRemoveItem(key);
    }
  } catch {
    // Silently fail - better to have stale state than crash
  }
}

/**
 * Clear all sessionStorage keys.
 */
export function clearSessionStorage(): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return;
  }
  
  try {
    sessionStorage.clear();
  } catch {
    // Silently fail
  }
}

// =============================================================================
// Client State Reconciliation
// =============================================================================

interface ReconcileResult {
  versionMismatch: boolean;
  previousVersion: number;
  currentVersion: number;
  clearedKeys: string[];
}

/**
 * Reconcile client storage with current schema version.
 * 
 * This should be called ONCE at app boot (in _app.tsx useLayoutEffect).
 * It checks for version mismatches and cleans up stale data automatically.
 * 
 * NEVER throws - all errors are caught and logged.
 */
export function reconcileClientStorage(): ReconcileResult {
  const result: ReconcileResult = {
    versionMismatch: false,
    previousVersion: 0,
    currentVersion: STORAGE_VERSION,
    clearedKeys: [],
  };
  
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return result;
  }
  
  try {
    const storedVersion = getStorageVersion();
    result.previousVersion = storedVersion;
    
    // Check for version mismatch
    if (storedVersion !== STORAGE_VERSION) {
      result.versionMismatch = true;
      
      // Clear stale keys (preserve draft)
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        
        // Check if this key belongs to our app
        const isAppKey = APP_KEY_PREFIXES.some(prefix => key.startsWith(prefix));
        if (!isAppKey) continue;
        
        // Skip the version key itself
        if (key === STORAGE_VERSION_KEY) continue;
        
        // Preserve draft data
        if (PRESERVE_KEYS.includes(key)) continue;
        
        keysToRemove.push(key);
      }
      
      // Remove stale keys
      for (const key of keysToRemove) {
        if (safeRemoveItem(key)) {
          result.clearedKeys.push(key);
        }
      }
      
      // Update version
      setStorageVersion(STORAGE_VERSION);
    }
    
    // Also clear sessionStorage on version mismatch for a completely fresh state
    if (result.versionMismatch) {
      clearSessionStorage();
    }
    
  } catch (error) {
    // Log but don't throw
    if (process.env.NODE_ENV === 'development') {
      console.error('[clientStorage] Error during reconciliation:', error);
    }
  }
  
  return result;
}

// =============================================================================
// Diagnostics
// =============================================================================

interface ClientDiagnostics {
  storageVersion: number;
  expectedVersion: number;
  versionMatch: boolean;
  hasDraft: boolean;
  draftValid: boolean;
  hasSessionCookie: boolean;
  path: string;
  userAgent: string;
  timestamp: string;
}

/**
 * Collect client-side diagnostics for debugging.
 * Returns a structured object that can be logged or sent to server.
 */
export function collectClientDiagnostics(): ClientDiagnostics {
  const diagnostics: ClientDiagnostics = {
    storageVersion: 0,
    expectedVersion: STORAGE_VERSION,
    versionMatch: false,
    hasDraft: false,
    draftValid: false,
    hasSessionCookie: false,
    path: '',
    userAgent: '',
    timestamp: new Date().toISOString(),
  };
  
  if (typeof window === 'undefined') {
    return diagnostics;
  }
  
  try {
    diagnostics.path = window.location.pathname;
    diagnostics.userAgent = navigator.userAgent?.slice(0, 100) || '';
    
    // Check storage version
    diagnostics.storageVersion = getStorageVersion();
    diagnostics.versionMatch = diagnostics.storageVersion === STORAGE_VERSION;
    
    // Check draft
    const draftRaw = safeGetItem('yourcorner:draft:v1');
    diagnostics.hasDraft = draftRaw !== null;
    
    if (draftRaw) {
      const draft = safeJsonParse(draftRaw);
      diagnostics.draftValid = draft !== null && typeof draft === 'object';
    }
    
    // Check session cookie
    diagnostics.hasSessionCookie = document.cookie.includes('yourcorner_session');
    
  } catch {
    // Silently fail
  }
  
  return diagnostics;
}

/**
 * Log boot diagnostics to console (development only).
 */
export function logBootDiagnostics(meAuthenticated: boolean): void {
  if (process.env.NODE_ENV !== 'development' && !process.env.NEXT_PUBLIC_DEBUG_AUTH) {
    return;
  }
  
  const diagnostics = collectClientDiagnostics();
  
  console.info('[boot]', {
    ...diagnostics,
    meAuthenticated,
  });
}

// =============================================================================
// Service Worker Cleanup
// =============================================================================

/**
 * Unregister any service workers (dev mode or when explicitly needed).
 * This prevents stale cached assets from causing issues.
 */
export function unregisterServiceWorkers(): Promise<boolean[]> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve([]);
  }
  
  return navigator.serviceWorker.getRegistrations()
    .then(registrations => {
      return Promise.all(
        registrations.map(registration => {
          if (process.env.NODE_ENV === 'development') {
            console.log('[boot] Unregistering service worker:', registration.scope);
          }
          return registration.unregister();
        })
      );
    })
    .catch(() => []);
}

