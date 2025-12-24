/**
 * Centralized logout utility.
 * 
 * This module provides a single function to clear all client-side state
 * on logout, ensuring a completely fresh experience.
 * 
 * STORAGE KEYS CLEARED:
 * 
 * localStorage:
 * - yourcorner:draft:v1 - Main draft storage
 * - yourcorner:* - All yourcorner prefixed keys
 * - mycorner:* - All legacy mycorner prefixed keys
 * - Any key containing: draft, user, session, auth
 * 
 * sessionStorage:
 * - publishIntent - Pending publish intent
 * - ALL keys - Complete clear for safety
 * 
 * COOKIES (cleared by /api/auth/logout):
 * - yourcorner_session - Auth session token
 * - yourcorner_draft_owner - Anonymous draft ownership
 * - yourcorner_anon - Anonymous session ID
 * - yourcorner_oauth_state - OAuth CSRF state
 */

import { clearDraft } from '@/lib/draft/storage';

/**
 * Storage keys that should be explicitly cleared on logout.
 * These are the known keys used by the app.
 */
const KNOWN_STORAGE_KEYS = [
  'yourcorner:draft:v1',
];

/**
 * Prefixes to match when clearing localStorage.
 * Any key starting with these will be removed.
 */
const STORAGE_KEY_PREFIXES = [
  'yourcorner:',
  'mycorner:',
];

/**
 * Substrings to match when clearing localStorage.
 * Any key containing these will be removed.
 */
const STORAGE_KEY_SUBSTRINGS = [
  'draft',
  'user',
  'session',
  'auth',
  'page',
  'editor',
];

/**
 * sessionStorage keys to clear.
 */
const SESSION_STORAGE_KEYS = [
  'publishIntent',
];

/**
 * Clear all client-side state on logout.
 * 
 * This function should be called before redirecting to /new?fresh=1
 * to ensure a completely clean slate.
 * 
 * @param options Optional configuration
 * @param options.verbose Enable console logging in development
 */
export function clearClientStateOnLogout(options?: { verbose?: boolean }): void {
  const verbose = options?.verbose ?? process.env.NODE_ENV === 'development';
  const removedKeys: string[] = [];

  // 1. Clear the main draft using the dedicated function
  clearDraft();
  removedKeys.push('yourcorner:draft:v1 (via clearDraft)');

  // 2. Clear localStorage - all matching keys
  if (typeof localStorage !== 'undefined') {
    // First, collect keys to remove (can't mutate while iterating)
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      
      // Check known keys
      if (KNOWN_STORAGE_KEYS.includes(key)) {
        keysToRemove.push(key);
        continue;
      }
      
      // Check prefixes
      if (STORAGE_KEY_PREFIXES.some(prefix => key.startsWith(prefix))) {
        keysToRemove.push(key);
        continue;
      }
      
      // Check substrings
      if (STORAGE_KEY_SUBSTRINGS.some(substr => key.toLowerCase().includes(substr))) {
        keysToRemove.push(key);
        continue;
      }
    }
    
    // Remove collected keys
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      removedKeys.push(key);
    });
  }

  // 3. Clear sessionStorage - completely
  if (typeof sessionStorage !== 'undefined') {
    // Track what we're clearing
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) {
        removedKeys.push(`session:${key}`);
      }
    }
    // Clear everything
    sessionStorage.clear();
  }

  // 4. Log what was cleared in development
  if (verbose) {
    console.log('[logout] Cleared client state:', removedKeys);
  }
}

/**
 * Perform a full logout: call server endpoint, clear client state, and redirect.
 * 
 * This is the canonical way to log out a user.
 * 
 * BULLETPROOF DESIGN:
 * 1. Always clears client state (even if server call fails)
 * 2. Always redirects to /new (using both replace() and assign() as fallback)
 * 3. Never throws - errors are logged but user is always redirected
 * 
 * @returns Promise that resolves when logout is complete
 */
export async function performFullLogout(): Promise<void> {
  const verbose = process.env.NODE_ENV === 'development';
  const redirectUrl = '/new?fresh=1';
  
  if (verbose) {
    console.log('[logout] Starting full logout...');
  }
  
  // STEP 1: Clear client-side state FIRST
  // This ensures even if the server call fails, client is cleaned up
  try {
    clearClientStateOnLogout({ verbose });
  } catch (error) {
    // Log but don't stop - we still need to redirect
    console.error('[logout] Error clearing client state:', error);
  }
  
  // STEP 2: Call server to clear cookies
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include', // Ensure cookies are sent/received
    });
    
    if (verbose) {
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        console.log('[logout] Server response:', data);
      } else {
        console.log('[logout] Server returned:', response.status);
      }
    }
  } catch (error) {
    // Log but don't stop - we still need to redirect
    console.error('[logout] Error calling logout endpoint:', error);
  }
  
  // STEP 3: Hard redirect to fresh new page
  // Using multiple methods to ensure redirect happens
  if (verbose) {
    console.log('[logout] Redirecting to:', redirectUrl);
  }
  
  try {
    // Method 1: replace() - doesn't add to history
    window.location.replace(redirectUrl);
  } catch {
    try {
      // Method 2: assign() - fallback
      window.location.assign(redirectUrl);
    } catch {
      // Method 3: href - last resort
      window.location.href = redirectUrl;
    }
  }
}

/**
 * Get a summary of what will be cleared on logout.
 * Useful for debugging.
 */
export function getLogoutClearSummary(): {
  localStorage: string[];
  sessionStorage: string[];
  cookies: string[];
} {
  const localStorageKeys: string[] = [];
  const sessionStorageKeys: string[] = [];
  
  // Check localStorage
  if (typeof localStorage !== 'undefined') {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      
      if (KNOWN_STORAGE_KEYS.includes(key)) {
        localStorageKeys.push(key);
        continue;
      }
      
      if (STORAGE_KEY_PREFIXES.some(prefix => key.startsWith(prefix))) {
        localStorageKeys.push(key);
        continue;
      }
      
      if (STORAGE_KEY_SUBSTRINGS.some(substr => key.toLowerCase().includes(substr))) {
        localStorageKeys.push(key);
        continue;
      }
    }
  }
  
  // Check sessionStorage
  if (typeof sessionStorage !== 'undefined') {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) {
        sessionStorageKeys.push(key);
      }
    }
  }
  
  return {
    localStorage: localStorageKeys,
    sessionStorage: sessionStorageKeys,
    cookies: [
      'yourcorner_session',
      'yourcorner_draft_owner',
      'yourcorner_anon',
      'yourcorner_oauth_state',
    ],
  };
}

