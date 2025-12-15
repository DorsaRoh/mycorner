/**
 * Hook for detecting viewport mode (mobile vs desktop) with SSR safety.
 * 
 * Uses container width if a ref is provided, otherwise falls back to window.innerWidth.
 * Handles hydration safely by not reading window during server render.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Standard breakpoint for mobile/desktop distinction.
 * Must match the CSS media query breakpoints used throughout the app.
 */
export const VIEWPORT_BREAKPOINT = 768;

export type ViewportMode = 'mobile' | 'desktop';

export interface UseViewportModeResult {
  /** Current viewport mode */
  mode: ViewportMode;
  /** Whether the hook has mounted and computed the initial mode */
  isMounted: boolean;
  /** The current width being used for detection */
  width: number;
}

export interface UseViewportModeOptions {
  /** Custom breakpoint (defaults to VIEWPORT_BREAKPOINT) */
  breakpoint?: number;
  /** Container ref to use for width detection (preferred over window) */
  containerRef?: React.RefObject<HTMLElement>;
  /** Debounce delay for resize updates (ms) */
  debounceMs?: number;
}

/**
 * Hook for responsive viewport mode detection.
 * 
 * Features:
 * - SSR-safe: doesn't read window during server render
 * - Listens to resize events
 * - Can use container width instead of window width
 * - Debounced updates to avoid thrashing
 * 
 * @example
 * const { mode, isMounted } = useViewportMode();
 * // mode is 'mobile' or 'desktop'
 * 
 * @example
 * // With container ref (preferred for canvas)
 * const containerRef = useRef<HTMLDivElement>(null);
 * const { mode } = useViewportMode({ containerRef });
 */
export function useViewportMode(options: UseViewportModeOptions = {}): UseViewportModeResult {
  const { 
    breakpoint = VIEWPORT_BREAKPOINT, 
    containerRef,
    debounceMs = 100,
  } = options;
  
  // Start with 'desktop' as default to avoid layout shift on wide screens
  // (most content looks fine on mobile, but mobile layout on desktop looks wrong)
  const [mode, setMode] = useState<ViewportMode>('desktop');
  const [isMounted, setIsMounted] = useState(false);
  const [width, setWidth] = useState(breakpoint); // Default to breakpoint
  
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const getWidth = useCallback(() => {
    // Prefer container width if ref is provided
    if (containerRef?.current) {
      return containerRef.current.getBoundingClientRect().width;
    }
    // Fall back to window width
    if (typeof window !== 'undefined') {
      return window.innerWidth;
    }
    return breakpoint; // Default for SSR
  }, [containerRef, breakpoint]);
  
  const computeMode = useCallback((currentWidth: number): ViewportMode => {
    return currentWidth < breakpoint ? 'mobile' : 'desktop';
  }, [breakpoint]);
  
  const updateMode = useCallback(() => {
    const currentWidth = getWidth();
    setWidth(currentWidth);
    setMode(computeMode(currentWidth));
  }, [getWidth, computeMode]);
  
  // Initial mount effect
  useEffect(() => {
    // Compute on mount
    updateMode();
    setIsMounted(true);
  }, [updateMode]);
  
  // Resize listener
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleResize = () => {
      // Debounce resize updates
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      
      resizeTimeoutRef.current = setTimeout(() => {
        updateMode();
      }, debounceMs);
    };
    
    window.addEventListener('resize', handleResize);
    
    // Also use ResizeObserver for container if provided
    let observer: ResizeObserver | null = null;
    if (containerRef?.current) {
      observer = new ResizeObserver(handleResize);
      observer.observe(containerRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      if (observer) {
        observer.disconnect();
      }
    };
  }, [containerRef, debounceMs, updateMode]);
  
  return { mode, isMounted, width };
}

/**
 * Simple utility to check if current viewport is mobile.
 * Only use in event handlers or effects, not during render.
 */
export function isMobileViewport(breakpoint: number = VIEWPORT_BREAKPOINT): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < breakpoint;
}

