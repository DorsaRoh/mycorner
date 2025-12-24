import { useLayoutEffect, useEffect, useRef } from 'react';
import type { AppProps } from 'next/app';
import { DEFAULT_THEME_VARS, applyCssVars } from '@/lib/themeVars';
import { 
  reconcileClientStorage, 
  unregisterServiceWorkers,
  logBootDiagnostics,
  STORAGE_VERSION,
} from '@/lib/clientStorage';
import '@/styles/globals.css';

/**
 * Check if we should reconcile auth state with the server.
 * This verifies that client-side assumptions match server state.
 */
async function checkAuthReconciliation(): Promise<boolean> {
  try {
    const response = await fetch('/api/me', {
      credentials: 'include',
      cache: 'no-store',
    });
    
    if (!response.ok) {
      return false;
    }
    
    const data = await response.json();
    return data.user !== null;
  } catch {
    return false;
  }
}

export default function App({ Component, pageProps }: AppProps) {
  const hasReconciled = useRef(false);
  
  // Apply theme vars synchronously on client mount via useLayoutEffect
  // This runs before paint, ensuring vars exist even if SSR injection fails
  useLayoutEffect(() => {
    applyCssVars(document.documentElement, DEFAULT_THEME_VARS);
    
    // Reconcile client storage BEFORE first paint
    // This ensures stale localStorage state doesn't break hydration
    if (!hasReconciled.current) {
      hasReconciled.current = true;
      
      try {
        const result = reconcileClientStorage();
        
        if (result.versionMismatch && process.env.NODE_ENV === 'development') {
          console.log('[app] Storage reconciled:', {
            previousVersion: result.previousVersion,
            currentVersion: result.currentVersion,
            clearedKeys: result.clearedKeys,
          });
        }
      } catch (error) {
        // Never let storage reconciliation crash the app
        if (process.env.NODE_ENV === 'development') {
          console.error('[app] Storage reconciliation failed:', error);
        }
      }
    }
  }, []);
  
  // Post-mount effects: service worker cleanup, auth reconciliation, diagnostics
  useEffect(() => {
    // In development, unregister any service workers to prevent stale cache issues
    if (process.env.NODE_ENV === 'development') {
      unregisterServiceWorkers();
    }
    
    // Log boot diagnostics and check auth state
    checkAuthReconciliation()
      .then(isAuthenticated => {
        logBootDiagnostics(isAuthenticated);
      })
      .catch(() => {
        logBootDiagnostics(false);
      });
      
  }, []);
  
  return <Component {...pageProps} />;
}
