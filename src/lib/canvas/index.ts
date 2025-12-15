/**
 * Canvas utilities for responsive coordinate handling.
 */

export * from './coordinates';
export * from './useCanvasSize';
export * from './useViewportMode';

// Re-export specific functions for convenience
export { clampToSafeZone, getSafeZoneBounds, SAFE_ZONE_MARGIN } from './coordinates';
export { VIEWPORT_BREAKPOINT, useViewportMode, isMobileViewport } from './useViewportMode';


