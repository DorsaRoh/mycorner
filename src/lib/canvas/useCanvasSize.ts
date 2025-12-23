/**
 * Hook for tracking canvas container dimensions with ResizeObserver.
 * Provides efficient resize detection for responsive canvas rendering.
 * 
 * Uses useLayoutEffect for synchronous measurement before paint to prevent
 * layout flicker during route transitions and hydration.
 */

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { 
  CanvasDimensions, 
  getCanvasDimensions, 
  REFERENCE_WIDTH, 
  REFERENCE_HEIGHT 
} from './coordinates';

// Minimum valid container size - smaller than this means container isn't ready
const MIN_VALID_SIZE = 50;
// Maximum retry attempts for initial measurement
const MAX_MEASURE_RETRIES = 10;

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
 * Sanitize dimensions to ensure all values are finite and valid.
 * This prevents NaN/Infinity from propagating to layout calculations.
 */
function sanitizeDimensions(dims: CanvasDimensions): CanvasDimensions {
  return {
    width: Number.isFinite(dims.width) && dims.width > 0 ? dims.width : REFERENCE_WIDTH,
    height: Number.isFinite(dims.height) && dims.height > 0 ? dims.height : REFERENCE_HEIGHT,
    scale: Number.isFinite(dims.scale) && dims.scale > 0 ? Math.max(0.1, dims.scale) : 1,
    scaleX: Number.isFinite(dims.scaleX) && dims.scaleX > 0 ? dims.scaleX : 1,
    scaleY: Number.isFinite(dims.scaleY) && dims.scaleY > 0 ? dims.scaleY : 1,
    offsetX: Number.isFinite(dims.offsetX) ? dims.offsetX : 0,
    offsetY: Number.isFinite(dims.offsetY) ? dims.offsetY : 0,
  };
}

/**
 * Hook for responsive canvas sizing using ResizeObserver.
 * Returns current dimensions and scale factors for coordinate conversion.
 * 
 * Uses useLayoutEffect for initial measurement to prevent layout flicker.
 */
export function useCanvasSize(options: UseCanvasSizeOptions = {}): UseCanvasSizeResult {
  const { debounceMs = 16, onResizeStart } = options;
  
  const containerRef = useRef<HTMLDivElement>(null!);
  // Track if we've done initial measurement (for SSR → client hydration)
  const hasMeasured = useRef(false);
  // Track retry attempts for initial measurement
  const retryCountRef = useRef(0);
  
  // Initialize with reference size (scale=1, no offset)
  // This ensures blocks are visible even before first measurement
  const [dimensions, setDimensions] = useState<CanvasDimensions>(() => 
    sanitizeDimensions(getCanvasDimensions(REFERENCE_WIDTH, REFERENCE_HEIGHT))
  );
  const [isResizing, setIsResizing] = useState(false);
  
  const resizeTimeoutRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDimensionsRef = useRef<{ width: number; height: number } | null>(null);
  
  /**
   * Core measurement function that reads container bounds and updates state.
   * Returns true if measurement was successful (valid dimensions obtained).
   */
  const measure = useCallback((): boolean => {
    if (!containerRef.current) return false;
    
    const rect = containerRef.current.getBoundingClientRect();
    
    // Check if container has valid dimensions
    const isValid = rect.width >= MIN_VALID_SIZE && rect.height >= MIN_VALID_SIZE;
    
    if (!isValid && !hasMeasured.current) {
      // Container not ready yet - will retry
      return false;
    }
    
    hasMeasured.current = true;
    const rawDims = getCanvasDimensions(rect.width, rect.height);
    const newDims = sanitizeDimensions(rawDims);
    
    // Only update if dimensions actually changed
    const last = lastDimensionsRef.current;
    if (!last || last.width !== rect.width || last.height !== rect.height) {
      lastDimensionsRef.current = { width: rect.width, height: rect.height };
      setDimensions(newDims);
    }
    
    return true;
  }, []);
  
  /**
   * Measurement with retry logic for handling hydration/route transitions.
   * Uses requestAnimationFrame to retry until valid dimensions are obtained.
   */
  const measureWithRetry = useCallback(() => {
    const attemptMeasure = () => {
      const success = measure();
      
      if (!success && retryCountRef.current < MAX_MEASURE_RETRIES) {
        retryCountRef.current++;
        rafRef.current = requestAnimationFrame(attemptMeasure);
      }
    };
    
    // Reset retry counter for new measurement cycle
    retryCountRef.current = 0;
    attemptMeasure();
  }, [measure]);
  
  // Use useLayoutEffect for synchronous initial measurement before paint
  // This prevents the "flash of wrong layout" on route transitions
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Attempt immediate synchronous measurement
    const success = measure();
    
    // If not successful, schedule retries with RAF
    if (!success) {
      measureWithRetry();
    }
    
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [measure, measureWithRetry]);
  
  // Set up ResizeObserver and window resize listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    // Track if this is the first ResizeObserver callback
    let isFirstCallback = true;
    
    const handleResize = (entries: ResizeObserverEntry[]) => {
      if (entries.length === 0) return;
      
      // First callback should be immediate (no debounce) to ensure
      // we get valid dimensions as soon as the container is laid out
      if (isFirstCallback) {
        isFirstCallback = false;
        measure();
        return;
      }
      
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
      
      // Debounce the dimension update for continuous resize
      if (debounceMs === 0) {
        rafRef.current = requestAnimationFrame(() => {
          measure();
          setIsResizing(false);
        });
      } else {
        resizeTimeoutRef.current = window.setTimeout(() => {
          rafRef.current = requestAnimationFrame(() => {
            measure();
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
        measure();
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
  }, [debounceMs, onResizeStart, measure, isResizing]);
  
  return {
    dimensions,
    containerRef,
    isResizing,
    recalculate: measure,
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

