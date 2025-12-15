import { useCallback, useRef, useEffect, useState, useMemo } from 'react';

/**
 * Save state machine states:
 * - idle: No changes yet or just loaded
 * - dirty: Local changes not saved yet
 * - saving: In-flight request
 * - saved: Server acknowledged latest version
 * - error: Last attempt failed; still dirty
 */
export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface SaveResult {
  success: boolean;
  serverRevision?: number;
  updatedAt?: string;
  acceptedLocalRevision?: number;
  error?: {
    code: 'CONFLICT' | 'PAYLOAD_TOO_LARGE' | 'INVALID' | 'NETWORK' | 'UNKNOWN';
    message: string;
    serverRevision?: number;
  };
}

export interface SaveControllerOptions {
  /**
   * Debounce delay in ms (default: 1000)
   */
  debounceMs?: number;
  
  /**
   * Callback to perform the save. Returns SaveResult.
   * Should include localRevision and baseServerRevision in the request.
   */
  onSave: (localRevision: number, baseServerRevision: number) => Promise<SaveResult>;
  
  /**
   * Initial server revision (from loaded document)
   */
  initialServerRevision?: number;
  
  /**
   * Callback when conflict detected
   */
  onConflict?: (serverRevision: number) => void;
  
  /**
   * Enable dev logging
   */
  debug?: boolean;
  
  /**
   * Enable/disable the save controller (default: true)
   * When disabled, markDirty and saveNow are no-ops
   */
  enabled?: boolean;
}

export interface SaveController {
  /** Current save state */
  saveState: SaveState;
  
  /** Is currently offline */
  isOffline: boolean;
  
  /** Mark document as dirty (local change occurred) */
  markDirty: () => void;
  
  /** Trigger immediate save (flush) */
  saveNow: () => Promise<void>;
  
  /** Retry failed save */
  retry: () => void;
  
  /** Current local revision */
  localRevision: number;
  
  /** Last acknowledged server revision */
  serverRevision: number;
  
  /** Last error message */
  lastError: string | null;
}

export function useSaveController({
  debounceMs = 1000,
  onSave,
  initialServerRevision = 0,
  onConflict,
  debug = false,
  enabled = true,
}: SaveControllerOptions): SaveController {
  // State
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [isOffline, setIsOffline] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  
  // Refs for mutable tracking (avoid stale closures)
  const localRevisionRef = useRef(0);
  const serverRevisionRef = useRef(initialServerRevision);
  const pendingRevisionRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isSavingRef = useRef(false);
  const isDirtyRef = useRef(false);
  
  // Expose current values as state for UI reactivity
  const [localRevision, setLocalRevision] = useState(0);
  const [serverRevision, setServerRevision] = useState(initialServerRevision);
  
  // Store onSave in ref to avoid dependency issues
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  
  const log = useCallback((...args: unknown[]) => {
    if (debug) {
      console.log('[SaveController]', ...args);
    }
  }, [debug]);
  
  // Update offline status
  useEffect(() => {
    const handleOnline = () => {
      log('Online');
      setIsOffline(false);
    };
    const handleOffline = () => {
      log('Offline');
      setIsOffline(true);
    };
    
    setIsOffline(!navigator.onLine);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [log]);
  
  /**
   * Core save logic
   */
  const performSave = useCallback(async (revisionToSave: number): Promise<boolean> => {
    if (isSavingRef.current) {
      log('Already saving, skipping');
      return false;
    }
    
    // Abort any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    isSavingRef.current = true;
    pendingRevisionRef.current = revisionToSave;
    setSaveState('saving');
    setLastError(null);
    
    log(`Saving revision ${revisionToSave}, base server revision ${serverRevisionRef.current}`);
    
    try {
      const result = await onSaveRef.current(revisionToSave, serverRevisionRef.current);
      
      // Check if this response is stale (newer local revision exists)
      if (localRevisionRef.current > revisionToSave) {
        log(`Stale response for revision ${revisionToSave}, current is ${localRevisionRef.current}`);
        isSavingRef.current = false;
        pendingRevisionRef.current = null;
        // Trigger another save for the newer revision
        return false;
      }
      
      if (result.success) {
        log(`Save successful, server revision: ${result.serverRevision}`);
        
        if (result.serverRevision !== undefined) {
          serverRevisionRef.current = result.serverRevision;
          setServerRevision(result.serverRevision);
        }
        
        isDirtyRef.current = false;
        isSavingRef.current = false;
        pendingRevisionRef.current = null;
        setSaveState('saved');
        return true;
      } else {
        // Handle error
        const error = result.error;
        log(`Save failed:`, error);
        
        if (error?.code === 'CONFLICT') {
          // Conflict detected
          if (error.serverRevision !== undefined) {
            serverRevisionRef.current = error.serverRevision;
            setServerRevision(error.serverRevision);
          }
          onConflict?.(error.serverRevision ?? serverRevisionRef.current);
          setLastError('Document changed elsewhere');
        } else if (error?.code === 'PAYLOAD_TOO_LARGE') {
          setLastError('Document too large');
        } else if (error?.code === 'NETWORK') {
          setLastError('Network error');
        } else {
          setLastError(error?.message ?? 'Save failed');
        }
        
        isDirtyRef.current = true;
        isSavingRef.current = false;
        pendingRevisionRef.current = null;
        setSaveState('error');
        return false;
      }
    } catch (err) {
      // Network error or abort
      if (err instanceof Error && err.name === 'AbortError') {
        log('Save aborted');
        isSavingRef.current = false;
        return false;
      }
      
      log('Save error:', err);
      isDirtyRef.current = true;
      isSavingRef.current = false;
      pendingRevisionRef.current = null;
      setLastError('Network error');
      setSaveState('error');
      return false;
    }
  }, [log, onConflict]);
  
  /**
   * Schedule a debounced save
   */
  const scheduleSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(async () => {
      debounceTimerRef.current = null;
      const revision = localRevisionRef.current;
      
      const success = await performSave(revision);
      
      // If there are newer changes, schedule another save
      if (!success && localRevisionRef.current > revision && isDirtyRef.current) {
        scheduleSave();
      }
    }, debounceMs);
  }, [debounceMs, performSave]);
  
  /**
   * Mark document as dirty (call on every local change)
   */
  const markDirty = useCallback(() => {
    // Skip if disabled
    if (!enabled) return;
    
    localRevisionRef.current += 1;
    setLocalRevision(localRevisionRef.current);
    isDirtyRef.current = true;
    
    log(`Marked dirty, revision: ${localRevisionRef.current}`);
    
    // Set state to dirty if we're not currently saving
    if (!isSavingRef.current) {
      setSaveState('dirty');
    }
    
    // Schedule debounced save
    scheduleSave();
  }, [enabled, log, scheduleSave]);
  
  /**
   * Immediate save (flush)
   */
  const saveNow = useCallback(async () => {
    // Skip if disabled
    if (!enabled) return;
    
    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    
    if (!isDirtyRef.current && !isSavingRef.current) {
      log('No changes to save');
      return;
    }
    
    // Wait for current save to complete if in progress
    if (isSavingRef.current) {
      log('Waiting for current save to complete...');
      // Poll until done (simple approach)
      await new Promise<void>((resolve) => {
        const check = () => {
          if (!isSavingRef.current) {
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
    }
    
    // If still dirty, save now
    if (isDirtyRef.current) {
      await performSave(localRevisionRef.current);
    }
  }, [enabled, log, performSave]);
  
  /**
   * Retry failed save
   */
  const retry = useCallback(() => {
    log('Retrying save');
    setLastError(null);
    setSaveState('dirty');
    scheduleSave();
  }, [log, scheduleSave]);
  
  /**
   * Flush on page unload (best-effort with sendBeacon)
   */
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Warn if there are unsaved changes
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
        
        // Best-effort flush using sendBeacon
        // Note: sendBeacon can only send small payloads and POST requests
        // For GraphQL, we'd need a dedicated beacon endpoint
        // For now, we just warn the user
        log('Page unload with unsaved changes');
      }
    };
    
    const handleVisibilityChange = () => {
      // Trigger immediate save when page becomes hidden
      if (document.visibilityState === 'hidden' && isDirtyRef.current) {
        log('Page hidden, triggering save');
        saveNow();
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [log, saveNow]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);
  
  // Reset server revision when initial value changes (e.g., after refetch)
  useEffect(() => {
    serverRevisionRef.current = initialServerRevision;
    setServerRevision(initialServerRevision);
  }, [initialServerRevision]);
  
  return useMemo(() => ({
    saveState,
    isOffline,
    markDirty,
    saveNow,
    retry,
    localRevision,
    serverRevision,
    lastError,
  }), [saveState, isOffline, markDirty, saveNow, retry, localRevision, serverRevision, lastError]);
}
