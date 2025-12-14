import { useCallback, useRef, useEffect, useState } from 'react';

interface UseAutosaveOptions {
  delay?: number;
  onSave: () => Promise<void>;
}

interface AutosaveState {
  saving: boolean;
  lastSaved: Date | null;
  error: string | null;
  hasUnsavedChanges: boolean;
}

export function useAutosave({ delay = 1000, onSave }: UseAutosaveOptions) {
  const [state, setState] = useState<AutosaveState>({
    saving: false,
    lastSaved: null,
    error: null,
    hasUnsavedChanges: false,
  });
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingRef = useRef(false);
  const saveCountRef = useRef(0);

  const trigger = useCallback(() => {
    pendingRef.current = true;
    setState((s) => ({ ...s, hasUnsavedChanges: true, error: null }));
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(async () => {
      if (!pendingRef.current) return;
      
      pendingRef.current = false;
      const saveId = ++saveCountRef.current;
      
      setState((s) => ({ ...s, saving: true }));
      
      try {
        await onSave();
        // Only update if this is still the latest save
        if (saveId === saveCountRef.current) {
          setState({
            saving: false,
            lastSaved: new Date(),
            error: null,
            hasUnsavedChanges: false,
          });
        }
      } catch (error) {
        console.error('Autosave failed:', error);
        if (saveId === saveCountRef.current) {
          setState((s) => ({
            ...s,
            saving: false,
            error: 'Failed to save. Retrying...',
            hasUnsavedChanges: true,
          }));
          // Retry after a delay
          setTimeout(() => trigger(), 3000);
        }
      }
    }, delay);
  }, [delay, onSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (state.hasUnsavedChanges || pendingRef.current) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [state.hasUnsavedChanges]);

  // Save immediately (for navigation away or publish)
  const saveNow = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    if (pendingRef.current || state.hasUnsavedChanges) {
      pendingRef.current = false;
      setState((s) => ({ ...s, saving: true }));
      
      try {
        await onSave();
        setState({
          saving: false,
          lastSaved: new Date(),
          error: null,
          hasUnsavedChanges: false,
        });
      } catch (error) {
        setState((s) => ({ ...s, saving: false, error: 'Save failed' }));
        throw error;
      }
    }
  }, [onSave, state.hasUnsavedChanges]);

  // Manual retry for when save fails
  const retry = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
    trigger();
  }, [trigger]);

  return {
    trigger,
    saveNow,
    retry,
    saving: state.saving,
    lastSaved: state.lastSaved,
    error: state.error,
    hasUnsavedChanges: state.hasUnsavedChanges,
  };
}
