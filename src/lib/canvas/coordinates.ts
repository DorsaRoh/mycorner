/**
 * Canvas coordinate system utilities for responsive layouts.
 * 
 * Uses a "reference canvas" approach where:
 * - Blocks store positions/sizes relative to a reference canvas (1200x800)
 * - Rendering scales to actual viewport using a scale factor
 * - Text scales proportionally with min/max clamps for readability
 * 
 * This preserves relative layouts across all screen sizes.
 * 
 * ## Implementation
 * 
 * The system uses width-based scaling with infinite vertical scroll:
 * - scale = contentWidth / REFERENCE_WIDTH (capped at 1.0 for max-width)
 * - Content is centered horizontally with side margins on wide screens
 * - Canvas extends vertically as needed (infinite scroll)
 * - All coordinates and sizes are multiplied by this scale for rendering
 * - All user interactions convert screen pixels to reference coordinates
 * 
 * ## Debug Mode
 * 
 * To enable canvas debug visualization in development:
 * Open browser console and run: window.__CANVAS_DEBUG = true
 * Then trigger a re-render (resize window or interact with canvas)
 * 
 * ## Test Plan
 * 
 * ### Screen Size Tests
 * 1. Mobile (390px): Full width, content scales down proportionally
 * 2. Laptop (1440px): Content centered with side margins, scale ~1.0
 * 3. Ultrawide (2560px): Content centered with larger side margins
 * 
 * ### Resize Tests
 * 1. Resize window while editing: Canvas re-renders without layout jump
 * 2. Resize during drag: Marquee cancels safely (no stuck state)
 * 3. Orientation change on mobile: Layout adapts smoothly
 * 
 * ### Persistence Tests
 * 1. Save on laptop, reload on mobile: Same relative layout preserved
 * 2. Draft saved in localStorage: Coordinates in reference space
 * 3. All blocks use reference coordinates (1200x800 space)
 * 
 * ### Interaction Tests
 * 1. Drag moves in reference coords (small screens = less distance per px)
 * 2. Resize handles work correctly at all scales
 * 3. Marquee selection works across all screen sizes (converts to ref coords)
 * 4. ObjectControls repositions when near screen edges
 * 5. CreationPalette stays within viewport bounds
 * 6. Click-to-add places blocks at correct reference position
 * 7. Drag-and-drop places blocks at correct reference position
 * 
 * ### Text Scaling Tests
 * 1. Font sizes scale with canvas but clamp between 10px-160px
 * 2. Padding scales proportionally with font size
 * 3. Edge-drag font scaling feels consistent across screen sizes
 */

// Reference canvas size - the "design" viewport
export const REFERENCE_WIDTH = 1200;
export const REFERENCE_HEIGHT = 800;

// Maximum content width for wide screens (creates side margins)
export const MAX_CONTENT_WIDTH = 1200;

// Safe zone margins - blocks cannot be placed/dragged into these areas
// This prevents UI issues on smaller screens where content might get cut off
// Keep this minimal - just enough to prevent edge clipping
export const SAFE_ZONE_MARGIN = 16; // Minimal margin to prevent edge clipping

// Font size limits for readability
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 160;

export interface CanvasDimensions {
  width: number;
  height: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  // Offset to center content when aspect ratio differs from reference
  offsetX: number;
  offsetY: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedRect {
  xN: number;
  yN: number;
  wN: number;
  hN: number;
}

/**
 * Compute canvas dimensions and scale factors from container size.
 * Uses width-based scaling with max-width capping for side margins on wide screens.
 * Canvas extends infinitely vertically.
 */
export function getCanvasDimensions(containerWidth: number, containerHeight: number): CanvasDimensions {
  // Cap content width for side margins on wide screens
  const contentWidth = Math.min(containerWidth, MAX_CONTENT_WIDTH);
  
  const scaleX = containerWidth / REFERENCE_WIDTH;
  const scaleY = containerHeight / REFERENCE_HEIGHT;
  
  // Use width-based scaling, capped at 1.0 (no upscaling beyond reference)
  const scale = contentWidth / REFERENCE_WIDTH;
  
  // Center content horizontally when there are side margins
  const offsetX = (containerWidth - contentWidth) / 2;
  const offsetY = 0; // No vertical offset - infinite scroll
  
  return {
    width: containerWidth,
    height: containerHeight,
    scale,
    scaleX,
    scaleY,
    offsetX,
    offsetY,
  };
}

/**
 * Convert reference coordinates to pixel coordinates for rendering.
 * Applies centering offset to position content correctly.
 */
export function refToPx(rect: Rect, dims: CanvasDimensions): Rect {
  return {
    x: rect.x * dims.scale + dims.offsetX,
    y: rect.y * dims.scale + dims.offsetY,
    width: rect.width * dims.scale,
    height: rect.height * dims.scale,
  };
}

/**
 * Convert pixel coordinates to reference coordinates for storage.
 * Removes centering offset before converting.
 */
export function pxToRef(rect: Rect, dims: CanvasDimensions): Rect {
  return {
    x: (rect.x - dims.offsetX) / dims.scale,
    y: (rect.y - dims.offsetY) / dims.scale,
    width: rect.width / dims.scale,
    height: rect.height / dims.scale,
  };
}

/**
 * Convert a pixel delta (from mouse movement) to reference delta.
 */
export function pxDeltaToRef(dx: number, dy: number, dims: CanvasDimensions): { dx: number; dy: number } {
  return {
    dx: dx / dims.scale,
    dy: dy / dims.scale,
  };
}

/**
 * Scale a font size from reference to pixels with min/max clamping.
 */
export function scaleFontSize(refFontSize: number, scale: number): number {
  const scaled = refFontSize * scale;
  return Math.round(Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, scaled)));
}

/**
 * Get the reference font size from a desired pixel size.
 */
export function unscaleFontSize(pxFontSize: number, scale: number): number {
  return Math.round(pxFontSize / scale);
}

/**
 * Detect if data appears to be legacy pixel-based (pre-migration).
 * Legacy data typically has large x/y values and no schemaVersion.
 */
export function isLegacyPixelData(blocks: Rect[]): boolean {
  if (blocks.length === 0) return false;
  
  // If any block has x or y greater than reference size, it's likely legacy
  // (new normalized data would have all values within reference bounds)
  const hasLargeCoords = blocks.some(b => 
    b.x > REFERENCE_WIDTH * 1.5 || 
    b.y > REFERENCE_HEIGHT * 1.5 ||
    b.width > REFERENCE_WIDTH ||
    b.height > REFERENCE_HEIGHT
  );
  
  return hasLargeCoords;
}

/**
 * Migrate legacy pixel data to reference coordinates.
 * Assumes legacy data was created at a specific viewport size.
 * Best-effort: uses current container or fallback to reference size.
 */
export function migrateLegacyBlocks<T extends Rect>(
  blocks: T[],
  legacyCanvasWidth: number = REFERENCE_WIDTH,
  legacyCanvasHeight: number = REFERENCE_HEIGHT
): T[] {
  const dims = getCanvasDimensions(legacyCanvasWidth, legacyCanvasHeight);
  
  return blocks.map(block => ({
    ...block,
    x: block.x / dims.scale,
    y: block.y / dims.scale,
    width: block.width / dims.scale,
    height: block.height / dims.scale,
  }));
}

/**
 * Clamp a position to keep the object visible within canvas bounds.
 * Clamps X to reference width, but allows infinite Y (vertical scroll).
 */
export function clampToCanvas(
  rect: Rect,
  _dims: CanvasDimensions,
  minVisible: number = 50
): Rect {
  // Clamp X to reference canvas width, allow unlimited Y
  const maxX = REFERENCE_WIDTH - minVisible;
  
  return {
    ...rect,
    x: Math.max(-rect.width + minVisible, Math.min(maxX, rect.x)),
    // Y can go as low as needed (no bottom clamp for infinite scroll)
    y: Math.max(-rect.height + minVisible, rect.y),
  };
}

/**
 * Clamp a block position to stay within the safe zone (respecting side margins).
 * Blocks cannot be dragged into the margin areas to prevent UI issues on smaller screens.
 */
export function clampToSafeZone(
  x: number,
  y: number,
  blockWidth: number,
  _blockHeight: number
): { x: number; y: number } {
  // Minimum X position is the left margin
  const minX = SAFE_ZONE_MARGIN;
  // Maximum X position ensures the block doesn't extend into the right margin
  const maxX = REFERENCE_WIDTH - SAFE_ZONE_MARGIN - blockWidth;
  
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    // Y remains unconstrained (infinite vertical scroll), but prevent going above 0
    y: Math.max(0, y),
  };
}

/**
 * Get the safe zone bounds for block placement.
 * Returns the min/max X values where blocks can be placed.
 */
export function getSafeZoneBounds(): { minX: number; maxX: number } {
  return {
    minX: SAFE_ZONE_MARGIN,
    maxX: REFERENCE_WIDTH - SAFE_ZONE_MARGIN,
  };
}

