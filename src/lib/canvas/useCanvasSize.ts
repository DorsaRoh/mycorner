/**
 * Hook for tracking canvas container dimensions with ResizeObserver.
 * Provides efficient resize detection for responsive canvas rendering.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  CanvasDimensions, 
  getCanvasDimensions, 
  REFERENCE_WIDTH, 
  REFERENCE_HEIGHT 
} from './coordinates';

export interface UseCanvasSizeOptions {
  /**
   * Debounce delay for resize updates (ms).
   * Set to 0 for immediate updates.
   */
  debounceMs?: number;
  
  /**
   * Callback when resize starts (for canceling active interactions).
   */
  onResizeStart?: () => void;
}

export interface UseCanvasSizeResult {
  /** Current canvas dimensions and scale factors */
  dimensions: CanvasDimensions;
  
  /** Ref to attach to the canvas container element */
  containerRef: React.RefObject<HTMLDivElement>;
  
  /** Whether a resize is currently in progress */
  isResizing: boolean;
  
  /** Force a dimension recalculation */
  recalculate: () => void;
}

/**
 * Hook for responsive canvas sizing using ResizeObserver.
 * Returns current dimensions and scale factors for coordinate conversion.
 */
export function useCanvasSize(options: UseCanvasSizeOptions = {}): UseCanvasSizeResult {
  const { debounceMs = 16, onResizeStart } = options;
  
  const containerRef = useRef<HTMLDivElement>(null!);
  const [dimensions, setDimensions] = useState<CanvasDimensions>(() => 
    getCanvasDimensions(REFERENCE_WIDTH, REFERENCE_HEIGHT)
  );
  const [isResizing, setIsResizing] = useState(false);
  
  const resizeTimeoutRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDimensionsRef = useRef<{ width: number; height: number } | null>(null);
  
  const recalculate = useCallback(() => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const newDims = getCanvasDimensions(rect.width, rect.height);
    
    // Only update if dimensions actually changed
    const last = lastDimensionsRef.current;
    if (!last || last.width !== rect.width || last.height !== rect.height) {
      lastDimensionsRef.current = { width: rect.width, height: rect.height };
      setDimensions(newDims);
    }
  }, []);
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    // Initial measurement
    recalculate();
    
    const handleResize = (entries: ResizeObserverEntry[]) => {
      if (entries.length === 0) return;
      
      // Signal resize start
      if (!isResizing) {
        setIsResizing(true);
        onResizeStart?.();
      }
      
      // Clear any pending timeouts
      if (resizeTimeoutRef.current) {
        window.clearTimeout(resizeTimeoutRef.current);
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      
      // Debounce the dimension update
      if (debounceMs === 0) {
        rafRef.current = requestAnimationFrame(recalculate);
      } else {
        resizeTimeoutRef.current = window.setTimeout(() => {
          rafRef.current = requestAnimationFrame(() => {
            recalculate();
            setIsResizing(false);
          });
        }, debounceMs);
      }
    };
    
    const observer = new ResizeObserver(handleResize);
    observer.observe(container);
    
    // Also listen to window resize for orientation changes
    const handleWindowResize = () => {
      if (resizeTimeoutRef.current) {
        window.clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = window.setTimeout(() => {
        recalculate();
        setIsResizing(false);
      }, debounceMs || 16);
    };
    
    window.addEventListener('resize', handleWindowResize);
    
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      if (resizeTimeoutRef.current) {
        window.clearTimeout(resizeTimeoutRef.current);
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [debounceMs, onResizeStart, recalculate, isResizing]);
  
  return {
    dimensions,
    containerRef,
    isResizing,
    recalculate,
  };
}

/**
 * Hook for canceling active drag/resize operations during viewport resize.
 * Returns a ref that can be checked to see if resize is in progress.
 */
export function useResizeCancellation(isResizing: boolean): React.MutableRefObject<boolean> {
  const shouldCancelRef = useRef(false);
  
  useEffect(() => {
    if (isResizing) {
      shouldCancelRef.current = true;
    } else {
      // Reset after a short delay to allow current operations to complete
      const timeout = setTimeout(() => {
        shouldCancelRef.current = false;
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [isResizing]);
  
  return shouldCancelRef;
}

