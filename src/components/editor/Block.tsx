import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import type { Block as BlockType, BlockStyle } from '@/shared/types';
import { DEFAULT_STYLE } from '@/shared/types';
import { getBlockStyles, getTextStyles, parseLinkContent, serializeLinkContent } from '@/shared/utils/blockStyles';
import { 
  CanvasDimensions,
  refToPx,
  pxToRef,
  scaleFontSize,
  clampToSafeZone,
  REFERENCE_WIDTH,
  REFERENCE_HEIGHT,
} from '@/lib/canvas';
import { MicroToolbar } from './MicroToolbar';
import styles from './Block.module.css';

// Resize edge types
type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null;

// Hit zone size for edge detection
const EDGE_HIT_ZONE = 8;

// Detect which edge/corner the mouse is near (accounts for rotation)
// For rotated elements, we need to "unrotate" the mouse position to detect edges correctly
function detectResizeEdgeFromRect(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  rotation: number = 0,
  actualWidth?: number,
  actualHeight?: number
): ResizeEdge {
  // Get the center of the element (bounding box center)
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  // Calculate mouse position relative to center
  let relX = clientX - centerX;
  let relY = clientY - centerY;
  
  // If element is rotated, unrotate the mouse position
  if (rotation !== 0) {
    const rad = -rotation * (Math.PI / 180); // Negative to reverse the rotation
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const unrotatedX = relX * cos - relY * sin;
    const unrotatedY = relX * sin + relY * cos;
    relX = unrotatedX;
    relY = unrotatedY;
  }
  
  // Use actual element dimensions if provided, otherwise fall back to bounding rect
  // For rotated elements, the bounding rect is larger than the visual element,
  // so we need the actual dimensions for accurate edge detection
  const halfW = (actualWidth ?? rect.width) / 2;
  const halfH = (actualHeight ?? rect.height) / 2;
  
  // Check edges using the unrotated coordinates relative to actual element size
  const nearLeft = relX < -halfW + EDGE_HIT_ZONE;
  const nearRight = relX > halfW - EDGE_HIT_ZONE;
  const nearTop = relY < -halfH + EDGE_HIT_ZONE;
  const nearBottom = relY > halfH - EDGE_HIT_ZONE;

  if (nearTop && nearLeft) return 'nw';
  if (nearTop && nearRight) return 'ne';
  if (nearBottom && nearLeft) return 'sw';
  if (nearBottom && nearRight) return 'se';
  if (nearTop) return 'n';
  if (nearBottom) return 's';
  if (nearLeft) return 'w';
  if (nearRight) return 'e';

  return null;
}

// Get cursor style for resize edge
function getResizeCursor(edge: ResizeEdge): string {
  switch (edge) {
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
    default:
      return 'grab';
  }
}

interface BlockProps {
  block: BlockType;
  selected: boolean;
  multiSelected?: boolean;
  isNew?: boolean;
  isEditing?: boolean;
  canvasDimensions?: CanvasDimensions;
  onSelect: () => void;
  onUpdate: (updates: Partial<BlockType>) => void;
  onUpdateMultiple?: (ids: Set<string>, updates: Partial<BlockType>) => void;
  onDragMultiple?: (ids: Set<string>, dx: number, dy: number) => void;
  selectedIds?: Set<string>;
  allBlocks?: BlockType[];
  onDelete: () => void;
  onSetEditing?: (editing: boolean) => void;
  onInteractionStart?: () => void;
  onFirstInteraction?: () => void;
  onBringForward?: () => void;
  onSendBackward?: () => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
}

// Memoized Block component - only rerenders when its own props change
export const Block = memo(function Block({
  block,
  selected,
  multiSelected = false,
  isNew = false,
  isEditing = false,
  canvasDimensions,
  onSelect,
  onUpdate,
  onUpdateMultiple,
  onDragMultiple,
  selectedIds = new Set(),
  allBlocks = [],
  onDelete,
  onSetEditing,
  onInteractionStart,
  onFirstInteraction,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
}: BlockProps) {
  const blockRef = useRef<HTMLDivElement>(null);
  const [interactionState, setInteractionState] = useState<'idle' | 'dragging' | 'resizing' | 'rotating'>('idle');
  const [hoveredEdge, setHoveredEdge] = useState<ResizeEdge>(null);
  
  // Default dimensions if not provided (uses reference size, scale = 1, no offset)
  const dims = canvasDimensions || {
    width: REFERENCE_WIDTH,
    height: REFERENCE_HEIGHT,
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: 0,
  };
  
  // Refs for smooth interaction (no state updates during drag/resize)
  const interactionRef = useRef({
    startX: 0,
    startY: 0,
    blockX: 0,
    blockY: 0,
    blockWidth: 0,
    blockHeight: 0,
    fontSize: 16,
    edge: null as ResizeEdge,
    cachedRect: null as DOMRect | null,
    rafId: 0,
    isMultiDrag: false,
    multiDragInitialPositions: new Map<string, { x: number; y: number }>(),
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    // Rotation
    startRotation: 0,
    centerX: 0,
    centerY: 0,
  });

  // Handle double-click to enter edit mode
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (block.type === 'TEXT' || block.type === 'LINK') {
      e.stopPropagation();
      e.preventDefault();
      onSetEditing?.(true);
    }
  }, [block.type, onSetEditing]);

  // Handle Enter key to enter edit mode when selected
  useEffect(() => {
    if (!selected || isEditing) return;
    if (block.type !== 'TEXT' && block.type !== 'LINK') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        onSetEditing?.(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selected, isEditing, block.type, onSetEditing]);

  // Handle style update
  const handleStyleChange = useCallback((newStyle: BlockStyle) => {
    // Don't auto-resize block when user manually adjusts font size through controls
    // Let the text measurement handle sizing only when content changes
    onUpdate({ style: newStyle });
  }, [onUpdate]);

  // Compute pixel positions from reference coordinates
  const pxRect = useMemo(() => refToPx(
    { x: block.x, y: block.y, width: block.width, height: block.height },
    dims
  ), [block.x, block.y, block.width, block.height, dims]);

  // Calculate inline styles using pixel dimensions (same as ViewerBlock)
  const blockStyles = useMemo(() => {
    const { outer, inner } = getBlockStyles(block.style, pxRect.width, pxRect.height);
    const mergedStyles = {
      ...outer,
      ...inner,
    };
    // Remove overflow:hidden from the Block container so ObjectControls isn't clipped.
    // For images, the imageWrapper already has overflow:hidden in CSS to clip rounded corners.
    // For text/link blocks, we never want overflow:hidden as it clips content.
    delete mergedStyles.overflow;
    return mergedStyles;
  }, [block.style, pxRect.width, pxRect.height]);

  // Handle mouse move for edge detection (hover cursor)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (interactionState !== 'idle') return;
    if (!selected) {
      setHoveredEdge(null);
      return;
    }

    if (!blockRef.current) return;
    const rect = blockRef.current.getBoundingClientRect();
    const edge = detectResizeEdgeFromRect(e.clientX, e.clientY, rect, block.rotation || 0, pxRect.width, pxRect.height);
    setHoveredEdge(edge);
  }, [selected, interactionState, block.rotation, pxRect.width, pxRect.height]);

  // Unified interaction start handler for both mouse and touch
  const handleInteractionStart = useCallback((clientX: number, clientY: number, target: HTMLElement, preventDefault: () => void) => {
    if (target.dataset.resize) return;
    if (target.dataset.delete) return;

    const tag = target.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      if (!selected) onSelect();
      return;
    }

    // Notify parent that an interaction is starting (for undo history)
    onInteractionStart?.();
    // Remove hint block on first real interaction
    onFirstInteraction?.();

    // Cache the rect once at interaction start
    const rect = blockRef.current?.getBoundingClientRect();
    if (!rect) return;

    const edge = selected ? detectResizeEdgeFromRect(clientX, clientY, rect, block.rotation || 0, pxRect.width, pxRect.height) : null;
    const isTextOrLink = block.type === 'TEXT' || block.type === 'LINK';

    // Check if this block is part of a multi-selection
    const isPartOfMultiSelection = selectedIds.has(block.id) && selectedIds.size > 1;
    
    // Store initial positions of all selected blocks for multi-drag
    const multiDragInitialPositions = new Map<string, { x: number; y: number }>();
    if (isPartOfMultiSelection && !edge) {
      for (const selectedBlock of allBlocks) {
        if (selectedIds.has(selectedBlock.id)) {
          multiDragInitialPositions.set(selectedBlock.id, { x: selectedBlock.x, y: selectedBlock.y });
        }
      }
    }

    // Store initial values in ref (no state update)
    interactionRef.current = {
      startX: clientX,
      startY: clientY,
      blockX: block.x,
      blockY: block.y,
      blockWidth: block.width,
      blockHeight: block.height,
      fontSize: block.style?.fontSize || DEFAULT_STYLE.fontSize || 16,
      edge,
      cachedRect: rect,
      rafId: 0,
      isMultiDrag: isPartOfMultiSelection && !edge,
      multiDragInitialPositions,
      scale: dims.scale,
      offsetX: dims.offsetX,
      offsetY: dims.offsetY,
      startRotation: block.rotation || 0,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
    };

    // For TEXT/LINK: edges are for font-size resizing, middle is for dragging
    // For other blocks: edges are for resizing, interior is for dragging
    if (isTextOrLink) {
      if (edge && selected) {
        preventDefault();
        setInteractionState('resizing');
      } else {
        if (!isPartOfMultiSelection) onSelect();
        setInteractionState('dragging');
      }
    } else if (edge && selected) {
      preventDefault();
      setInteractionState('resizing');
    } else {
      if (!isPartOfMultiSelection) onSelect();
      setInteractionState('dragging');
    }
  }, [block.x, block.y, block.width, block.height, block.style?.fontSize, block.type, block.id, block.rotation, selected, selectedIds, allBlocks, dims.scale, pxRect.width, pxRect.height, onSelect, onInteractionStart, onFirstInteraction]);

  // Drag/resize handling with rAF optimization
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    handleInteractionStart(e.clientX, e.clientY, e.target as HTMLElement, () => e.preventDefault());
  }, [handleInteractionStart]);

  // Touch event handler for mobile support
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return; // Only single touch
    const touch = e.touches[0];
    handleInteractionStart(touch.clientX, touch.clientY, e.target as HTMLElement, () => e.preventDefault());
  }, [handleInteractionStart]);

  // Rotation handle interaction
  const handleRotationStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    onInteractionStart?.();
    
    const rect = blockRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    // Calculate center of the block
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    interactionRef.current = {
      ...interactionRef.current,
      startX: e.clientX,
      startY: e.clientY,
      startRotation: block.rotation || 0,
      centerX,
      centerY,
    };
    
    setInteractionState('rotating');
  }, [block.rotation, onInteractionStart]);

  // Unified mouse move/up handler for drag, resize, and rotate
  useEffect(() => {
    if (interactionState === 'idle') return;

    const handleMouseMove = (e: MouseEvent) => {
      // Cancel any pending rAF
      if (interactionRef.current.rafId) {
        cancelAnimationFrame(interactionRef.current.rafId);
      }

      // Use rAF for smooth visual updates
      interactionRef.current.rafId = requestAnimationFrame(() => {
        const ref = interactionRef.current;
        const scale = ref.scale;
        
        // Pixel deltas from mouse movement
        const pxDx = e.clientX - ref.startX;
        const pxDy = e.clientY - ref.startY;
        
        // Convert to reference deltas for coordinate updates
        const dx = pxDx / scale;
        const dy = pxDy / scale;

        if (!blockRef.current) return;

        if (interactionState === 'dragging') {
          // Calculate new position in reference coordinates
          const rawX = ref.blockX + dx;
          const rawY = ref.blockY + dy;
          
          // Clamp to safe zone (respecting side margins)
          const { x: newRefX, y: newRefY } = clampToSafeZone(rawX, rawY, ref.blockWidth, ref.blockHeight);
          
          // Apply to DOM in pixels for visual feedback (include offset for centering)
          blockRef.current.style.left = `${newRefX * scale + ref.offsetX}px`;
          blockRef.current.style.top = `${newRefY * scale + ref.offsetY}px`;
        } else if (interactionState === 'resizing') {
          const edge = ref.edge;
          const isTextOrLink = block.type === 'TEXT' || block.type === 'LINK';
          const minWidth = isTextOrLink ? 40 : 50;
          const minHeight = isTextOrLink ? 16 : 30;
          const isCornerResize = edge === 'ne' || edge === 'nw' || edge === 'se' || edge === 'sw';
          const isHorizontalResize = edge === 'e' || edge === 'w';
          const isVerticalResize = edge === 'n' || edge === 's';

          // For TEXT/LINK blocks:
          // - Corner (diagonal) resize: changes font size only
          // - Left/Right (e/w) resize: changes width only
          // - Top/Bottom (n/s) resize: changes height only
          if (isTextOrLink && isCornerResize) {
            // Diagonal resize changes font size proportionally
            // Use the diagonal distance for scaling
            const diagonalDelta = (dx + dy) / 2;
            const fontScaleFactor = 1 + (diagonalDelta / 100);
            const newFontSize = Math.max(8, Math.min(200, Math.round(ref.fontSize * fontScaleFactor)));
            
            // Apply font size to text content elements
            const textEl = blockRef.current.querySelector(`.${styles.textDisplay}, .${styles.textContent}, .${styles.linkDisplayInline}`);
            if (textEl) {
              (textEl as HTMLElement).style.fontSize = `${newFontSize * scale}px`;
            }
          } else if (isTextOrLink && isHorizontalResize) {
            // Horizontal resize changes width only
            let newWidth = ref.blockWidth;
            let newX = ref.blockX;

            if (edge === 'e') {
              newWidth = Math.max(minWidth, ref.blockWidth + dx);
            } else if (edge === 'w') {
              newWidth = Math.max(minWidth, ref.blockWidth - dx);
              const actualDx = ref.blockWidth - newWidth;
              newX = ref.blockX - actualDx;
            }

            const rotation = block.rotation || 0;
            blockRef.current.style.left = `${newX * scale + ref.offsetX}px`;
            blockRef.current.style.width = `${newWidth * scale}px`;
            if (rotation !== 0) {
              blockRef.current.style.transform = `rotate(${rotation}deg)`;
            }
          } else if (isTextOrLink && isVerticalResize) {
            // Vertical resize changes height only
            let newHeight = ref.blockHeight;
            let newY = ref.blockY;

            if (edge === 's') {
              newHeight = Math.max(minHeight, ref.blockHeight + dy);
            } else if (edge === 'n') {
              newHeight = Math.max(minHeight, ref.blockHeight - dy);
              const actualDy = ref.blockHeight - newHeight;
              newY = ref.blockY - actualDy;
            }

            const rotation = block.rotation || 0;
            blockRef.current.style.top = `${newY * scale + ref.offsetY}px`;
            blockRef.current.style.height = `${newHeight * scale}px`;
            if (rotation !== 0) {
              blockRef.current.style.transform = `rotate(${rotation}deg)`;
            }
          } else {
            // Non-TEXT/LINK blocks: resize dimensions normally
            let newWidth = ref.blockWidth;
            let newHeight = ref.blockHeight;
            let newX = ref.blockX;
            let newY = ref.blockY;

            // Calculate new dimensions based on edge (using reference deltas)
            if (edge === 'e' || edge === 'ne' || edge === 'se') {
              newWidth = Math.max(minWidth, ref.blockWidth + dx);
            }
            if (edge === 'w' || edge === 'nw' || edge === 'sw') {
              newWidth = Math.max(minWidth, ref.blockWidth - dx);
              const actualDx = ref.blockWidth - newWidth;
              newX = ref.blockX - actualDx;
            }
            if (edge === 's' || edge === 'se' || edge === 'sw') {
              newHeight = Math.max(minHeight, ref.blockHeight + dy);
            }
            if (edge === 'n' || edge === 'ne' || edge === 'nw') {
              newHeight = Math.max(minHeight, ref.blockHeight - dy);
              const actualDy = ref.blockHeight - newHeight;
              newY = ref.blockY - actualDy;
            }

            // Apply to DOM in pixels for smooth resizing (include offset for centering)
            // Apply rotation if present
            const rotation = block.rotation || 0;
            blockRef.current.style.left = `${newX * scale + ref.offsetX}px`;
            blockRef.current.style.top = `${newY * scale + ref.offsetY}px`;
            blockRef.current.style.width = `${newWidth * scale}px`;
            blockRef.current.style.height = `${newHeight * scale}px`;
            if (rotation !== 0) {
              blockRef.current.style.transform = `rotate(${rotation}deg)`;
            }
          }
        } else if (interactionState === 'rotating') {
          // Calculate angle from center to mouse position
          const angleRad = Math.atan2(
            e.clientY - ref.centerY,
            e.clientX - ref.centerX
          );
          // Convert to degrees, offset by 90 since handle is at top
          const angleDeg = (angleRad * 180 / Math.PI) + 90;
          // Calculate new rotation
          const newRotation = Math.round(angleDeg);
          // Clamp to -180 to 180
          const clampedRotation = ((newRotation + 180) % 360) - 180;
          // Apply to DOM for visual feedback
          blockRef.current.style.transform = `rotate(${clampedRotation}deg)`;
        }
      });
    };

    const handleMouseUp = (e: MouseEvent) => {
      // Cancel any pending rAF
      if (interactionRef.current.rafId) {
        cancelAnimationFrame(interactionRef.current.rafId);
      }

      const ref = interactionRef.current;
      const scale = ref.scale;
      
      // Pixel deltas from mouse movement
      const pxDx = e.clientX - ref.startX;
      const pxDy = e.clientY - ref.startY;
      
      // Convert to reference deltas for coordinate updates
      const dx = pxDx / scale;
      const dy = pxDy / scale;
      
      // Check if this was just a click (minimal movement in pixels) vs actual drag
      const wasJustClick = Math.abs(pxDx) < 5 && Math.abs(pxDy) < 5;

      // Commit final state to React (all values in reference coordinates)
      if (interactionState === 'dragging') {
        // Multi-block drag: update all selected blocks with reference deltas
        if (ref.isMultiDrag && onDragMultiple && !wasJustClick) {
          onDragMultiple(selectedIds, dx, dy);
        } else {
          const rawX = ref.blockX + dx;
          const rawY = ref.blockY + dy;
          // Clamp to safe zone (respecting side margins)
          const { x: newX, y: newY } = clampToSafeZone(rawX, rawY, ref.blockWidth, ref.blockHeight);
          if (newX !== block.x || newY !== block.y) {
            onUpdate({ x: newX, y: newY });
          }
        }
        // Note: Don't auto-enter edit mode on click - user must double-click or press Enter
      } else if (interactionState === 'resizing') {
        const edge = ref.edge;
        const isTextOrLink = block.type === 'TEXT' || block.type === 'LINK';
        const minWidth = isTextOrLink ? 40 : 50;
        const minHeight = isTextOrLink ? 16 : 30;
        const isCornerResize = edge === 'ne' || edge === 'nw' || edge === 'se' || edge === 'sw';
        const isHorizontalResize = edge === 'e' || edge === 'w';
        const isVerticalResize = edge === 'n' || edge === 's';

        const updates: Partial<BlockType> = {};

        if (isTextOrLink && isCornerResize) {
          // Diagonal resize changes font size only
          const diagonalDelta = (dx + dy) / 2;
          const fontScaleFactor = 1 + (diagonalDelta / 100);
          const newFontSize = Math.max(8, Math.min(200, Math.round(ref.fontSize * fontScaleFactor)));
          
          // Build complete style object with new fontSize
          const newStyle: BlockStyle = {
            ...DEFAULT_STYLE,
            ...block.style,
            fontSize: newFontSize,
          };
          
          updates.style = newStyle;
          
          if (process.env.NODE_ENV === 'development') {
            console.log('[Block] Diagonal resize fontSize:', {
              original: ref.fontSize,
              newFontSize,
              fontScaleFactor,
              diagonalDelta,
            });
          }
        } else if (isTextOrLink && isHorizontalResize) {
          // Horizontal resize changes width only
          let newWidth = ref.blockWidth;

          if (edge === 'e') {
            newWidth = Math.max(minWidth, ref.blockWidth + dx);
          } else if (edge === 'w') {
            newWidth = Math.max(minWidth, ref.blockWidth - dx);
            const actualDx = ref.blockWidth - newWidth;
            updates.x = ref.blockX - actualDx;
          }

          updates.width = newWidth;
        } else if (isTextOrLink && isVerticalResize) {
          // Vertical resize changes height only
          let newHeight = ref.blockHeight;

          if (edge === 's') {
            newHeight = Math.max(minHeight, ref.blockHeight + dy);
          } else if (edge === 'n') {
            newHeight = Math.max(minHeight, ref.blockHeight - dy);
            const actualDy = ref.blockHeight - newHeight;
            updates.y = ref.blockY - actualDy;
          }

          updates.height = newHeight;
        } else {
          // Non-TEXT/LINK blocks: resize dimensions normally
          let newWidth = ref.blockWidth;
          let newHeight = ref.blockHeight;

          if (edge === 'e' || edge === 'ne' || edge === 'se') {
            newWidth = Math.max(minWidth, ref.blockWidth + dx);
          }
          if (edge === 'w' || edge === 'nw' || edge === 'sw') {
            newWidth = Math.max(minWidth, ref.blockWidth - dx);
            const actualDx = ref.blockWidth - newWidth;
            updates.x = ref.blockX - actualDx;
          }
          if (edge === 's' || edge === 'se' || edge === 'sw') {
            newHeight = Math.max(minHeight, ref.blockHeight + dy);
          }
          if (edge === 'n' || edge === 'ne' || edge === 'nw') {
            newHeight = Math.max(minHeight, ref.blockHeight - dy);
            const actualDy = ref.blockHeight - newHeight;
            updates.y = ref.blockY - actualDy;
          }

          updates.width = newWidth;
          updates.height = newHeight;
        }

        // Ensure updates are applied - log for debugging
        if (process.env.NODE_ENV === 'development') {
          console.log('[Block] Resize update:', {
            blockId: block.id,
            blockType: block.type,
            edge: edge,
            updates: JSON.stringify(updates),
          });
        }
        
        onUpdate(updates);
      } else if (interactionState === 'rotating') {
        // Calculate final rotation angle
        const angleRad = Math.atan2(
          e.clientY - ref.centerY,
          e.clientX - ref.centerX
        );
        const angleDeg = (angleRad * 180 / Math.PI) + 90;
        const newRotation = Math.round(angleDeg);
        const clampedRotation = ((newRotation + 180) % 360) - 180;
        
        // Commit rotation to state
        onUpdate({ rotation: clampedRotation });
      }

      setInteractionState('idle');
    };

    // Touch move handler for mobile
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      // Create a synthetic event-like object for the shared logic
      handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent);
    };

    // Touch end handler for mobile
    const handleTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      handleMouseUp({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchEnd);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
      if (interactionRef.current.rafId) {
        cancelAnimationFrame(interactionRef.current.rafId);
      }
    };
  }, [interactionState, block.x, block.y, block.type, block.style, selectedIds, onUpdate, onDragMultiple, onSetEditing]);

  const handleContentChange = useCallback((content: string) => {
    onUpdate({ content });
  }, [onUpdate]);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;

    const maxWidth = 500;
    const maxHeight = 400;

    let newWidth = naturalWidth;
    let newHeight = naturalHeight;

    if (newWidth > maxWidth) {
      const ratio = maxWidth / newWidth;
      newWidth = maxWidth;
      newHeight = Math.round(naturalHeight * ratio);
    }
    if (newHeight > maxHeight) {
      const ratio = maxHeight / newHeight;
      newHeight = maxHeight;
      newWidth = Math.round(newWidth * ratio);
    }

    newWidth = Math.max(100, newWidth);
    newHeight = Math.max(60, newHeight);

    if (Math.abs(block.width - newWidth) > 10 || Math.abs(block.height - newHeight) > 10) {
      onUpdate({ width: newWidth, height: newHeight });
    }
  }, [block.width, block.height, onUpdate]);

  // Handle text measurement - ensure minimum height covers content with no padding
  // Width is user-controlled via left/right edge resize; height is user-adjustable but has content as minimum
  // Measurements come in pixels (scaled), convert back to reference coordinates
  const handleTextMeasure = useCallback((measuredWidth: number, measuredHeight: number) => {
    // Convert from pixels back to reference coordinates
    const refHeight = measuredHeight / dims.scale;
    const minContentHeight = Math.max(16, Math.ceil(refHeight));
    
    // Only update height if it's currently LESS than the minimum content height
    // This allows users to make height larger, but ensures content always fits
    if (block.height < minContentHeight) {
      onUpdate({ height: minContentHeight });
    }
  }, [block.height, dims.scale, onUpdate]);

  const cursorStyle = useMemo(() => {
    const isTextOrLink = block.type === 'TEXT' || block.type === 'LINK';
    if (interactionState === 'dragging') return 'grabbing';
    if (interactionState === 'resizing') return getResizeCursor(interactionRef.current.edge);
    // For TEXT/LINK: edges use resize cursor (for font scaling), middle uses move cursor
    if (isTextOrLink) {
      if (hoveredEdge) return getResizeCursor(hoveredEdge);
      return 'move';
    }
    // For other blocks: edges use resize cursor, middle uses grab
    if (hoveredEdge) return getResizeCursor(hoveredEdge);
    return 'grab';
  }, [interactionState, hoveredEdge, block.type]);

  const classNames = [
    styles.block,
    styles[block.type.toLowerCase()],
    selected ? styles.selected : '',
    multiSelected ? styles.multiSelected : '',
    interactionState === 'dragging' ? styles.dragging : '',
    interactionState === 'rotating' ? styles.rotating : '',
    interactionState === 'resizing' ? styles.resizing : '',
    isNew ? styles.entering : '',
    isEditing ? styles.editing : '',
  ].filter(Boolean).join(' ');

  // Scale font size for rendering
  const scaledFontSize = useMemo(() => {
    const baseFontSize = block.style?.fontSize || DEFAULT_STYLE.fontSize || 16;
    return scaleFontSize(baseFontSize, dims.scale);
  }, [block.style?.fontSize, dims.scale]);

  // Calculate rotation transform
  const rotationStyle = useMemo(() => {
    if (!block.rotation || block.rotation === 0) return {};
    return {
      transform: `rotate(${block.rotation}deg)`,
      transformOrigin: 'center center',
    };
  }, [block.rotation]);

  return (
    <div
      ref={blockRef}
      className={classNames}
      style={{
        left: pxRect.x,
        top: pxRect.y,
        width: pxRect.width,
        height: pxRect.height,
        cursor: cursorStyle,
        ...blockStyles,
        ...rotationStyle,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredEdge(null)}
      onDoubleClick={handleDoubleClick}
      onTouchStart={handleTouchStart}
    >
      <BlockContent
        type={block.type}
        content={block.content}
        style={block.style}
        scaledFontSize={scaledFontSize}
        canvasScale={dims.scale}
        blockWidth={pxRect.width}
        onChange={handleContentChange}
        onImageLoad={handleImageLoad}
        onTextMeasure={handleTextMeasure}
        selected={selected}
        isEditing={isEditing}
        onSetEditing={onSetEditing}
      />

      {/* Rotation handle - visible when selected */}
      {selected && !isEditing && (
        <div 
          className={styles.rotationHandle}
          onMouseDown={handleRotationStart}
        >
          <div className={styles.rotationDot} />
          <div className={styles.rotationLine} />
        </div>
      )}

      {selected && !isEditing && (
        <MicroToolbar
          block={block}
          onStyleChange={handleStyleChange}
          onDelete={onDelete}
          onBringForward={onBringForward || (() => {})}
          onSendBackward={onSendBackward || (() => {})}
          onBringToFront={onBringToFront || (() => {})}
          onSendToBack={onSendToBack || (() => {})}
        />
      )}
    </div>
  );
});

// BlockContent component
interface BlockContentProps {
  type: BlockType['type'];
  content: string;
  style?: BlockStyle;
  scaledFontSize?: number;
  canvasScale?: number;
  blockWidth?: number; // Width of block container for text wrapping measurement
  onChange: (content: string) => void;
  onImageLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  onTextMeasure?: (width: number, height: number) => void;
  selected: boolean;
  isEditing?: boolean;
  onSetEditing?: (editing: boolean) => void;
}

const BlockContent = memo(function BlockContent({
  type,
  content,
  style,
  scaledFontSize,
  canvasScale = 1,
  blockWidth,
  onChange,
  onImageLoad,
  onTextMeasure,
  selected,
  isEditing,
  onSetEditing,
}: BlockContentProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Get text styles but override fontSize with scaled version (no padding for dynamic sizing)
  const textStyles = useMemo(() => {
    const baseStyles = getTextStyles(style);
    if (scaledFontSize) {
      return {
        ...baseStyles,
        fontSize: `${scaledFontSize}px`,
        padding: '0',
      };
    }
    return { ...baseStyles, padding: '0' };
  }, [style, scaledFontSize]);

  useEffect(() => {
    if (type === 'TEXT' && isEditing && textareaRef.current) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
        const len = textareaRef.current?.value.length || 0;
        textareaRef.current?.setSelectionRange(len, len);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [type, isEditing]);

  // Measure text content and report dimensions using a hidden measurement element
  // Uses block width for text wrapping to calculate proper height
  useEffect(() => {
    if ((type === 'TEXT') && onTextMeasure) {
      // Create a hidden measurement element with fixed width for text wrapping
      const measureEl = document.createElement('div');
      // Use blockWidth if available (scaled), otherwise auto width
      const widthStyle = blockWidth ? `width: ${blockWidth}px;` : 'width: auto;';
      measureEl.style.cssText = `
        position: absolute;
        visibility: hidden;
        height: auto;
        ${widthStyle}
        white-space: pre-wrap;
        word-break: break-word;
        font-family: ${textStyles.fontFamily || 'inherit'};
        font-size: ${textStyles.fontSize || '16px'};
        font-weight: ${textStyles.fontWeight || 'normal'};
        line-height: 1.4;
        padding: 0;
      `;
      measureEl.textContent = content || 'Type something...';
      document.body.appendChild(measureEl);
      
      const measuredWidth = measureEl.offsetWidth;
      const measuredHeight = measureEl.offsetHeight;
      
      document.body.removeChild(measureEl);
      
      onTextMeasure(measuredWidth, measuredHeight);
    }
  }, [type, content, style, textStyles, blockWidth, onTextMeasure]);

  switch (type) {
    case 'TEXT':
      if (isEditing) {
        return (
          <textarea
            ref={textareaRef}
            className={styles.textContent}
            style={textStyles}
            value={content}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              // Enter finishes editing and deselects (Shift+Enter for newline)
              if (e.key === 'Enter' && !e.shiftKey) {
                e.stopPropagation();
                e.preventDefault();
                textareaRef.current?.blur();
                onSetEditing?.(false);
              } else if (e.key === 'Enter') {
                e.stopPropagation(); // Allow Shift+Enter for newline
              }
              if (e.key === 'Escape') {
                e.stopPropagation();
                e.preventDefault();
                textareaRef.current?.blur();
                onSetEditing?.(false);
              }
              if (e.key === 'Delete' || e.key === 'Backspace') e.stopPropagation();
            }}
            onBlur={() => onSetEditing?.(false)}
            placeholder="Type something..."
            onMouseDown={(e) => e.stopPropagation()}
          />
        );
      }

      return (
        <div className={styles.textDisplay} style={textStyles}>
          {content || <span className={styles.textPlaceholder}>Type something...</span>}
        </div>
      );

    case 'IMAGE':
      if (!content) {
        return (
          <div className={styles.imagePlaceholder}>
            <span>No image</span>
          </div>
        );
      }

      // Show loading state for images that are still uploading
      if (content === '__loading__') {
        return (
          <div className={styles.imageLoading}>
            <div className={styles.imageLoadingSpinner} />
          </div>
        );
      }

      return (
        <div className={styles.imageWrapper}>
          <img
            src={content}
            alt=""
            className={styles.imageContent}
            draggable={false}
            onLoad={onImageLoad}
          />
        </div>
      );

    case 'LINK':
      return (
        <LinkBlockContent
          content={content}
          style={style}
          scaledFontSize={scaledFontSize}
          canvasScale={canvasScale}
          blockWidth={blockWidth}
          onChange={onChange}
          onTextMeasure={onTextMeasure}
          selected={selected}
          isEditing={isEditing}
          onSetEditing={onSetEditing}
        />
      );

    default:
      return null;
  }
});

// LinkBlockContent component
interface LinkBlockContentProps {
  content: string;
  style?: BlockStyle;
  scaledFontSize?: number;
  canvasScale?: number;
  blockWidth?: number; // Width of block container for text wrapping measurement
  onChange: (content: string) => void;
  onTextMeasure?: (width: number, height: number) => void;
  selected: boolean;
  isEditing?: boolean;
  onSetEditing?: (editing: boolean) => void;
}

const LinkBlockContent = memo(function LinkBlockContent({
  content,
  style,
  scaledFontSize,
  canvasScale = 1,
  blockWidth,
  onChange,
  onTextMeasure,
  selected,
  isEditing,
  onSetEditing,
}: LinkBlockContentProps) {
  const { name, url } = parseLinkContent(content);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get text styles but override fontSize with scaled version (no padding for dynamic sizing)
  const textStyles = useMemo(() => {
    const baseStyles = getTextStyles(style);
    if (scaledFontSize) {
      return {
        ...baseStyles,
        fontSize: `${scaledFontSize}px`,
        padding: '0',
      };
    }
    return { ...baseStyles, padding: '0' };
  }, [style, scaledFontSize]);

  // Measure link display and report dimensions using a hidden measurement element
  // Uses block width for text wrapping to calculate proper height
  useEffect(() => {
    if (onTextMeasure && !isEditing) {
      const displayText = name || url || 'Add link';
      const measureEl = document.createElement('div');
      // Use blockWidth if available (scaled), otherwise auto width
      const widthStyle = blockWidth ? `width: ${blockWidth}px;` : 'width: auto;';
      measureEl.style.cssText = `
        position: absolute;
        visibility: hidden;
        height: auto;
        ${widthStyle}
        white-space: pre-wrap;
        word-break: break-word;
        display: flex;
        align-items: center;
        gap: 4px;
        font-family: ${textStyles.fontFamily || 'inherit'};
        font-size: ${textStyles.fontSize || '16px'};
        font-weight: ${textStyles.fontWeight || 'normal'};
        line-height: 1.5;
        padding: 0;
      `;
      measureEl.innerHTML = `<span>${displayText}</span>${url ? '<span style="font-size: 0.75em;">↗</span>' : ''}`;
      document.body.appendChild(measureEl);
      
      const measuredWidth = measureEl.offsetWidth;
      const measuredHeight = measureEl.offsetHeight;
      
      document.body.removeChild(measureEl);
      
      onTextMeasure(measuredWidth, measuredHeight);
    }
  }, [content, name, url, style, textStyles, blockWidth, onTextMeasure, isEditing]);

  const handleNameChange = useCallback((newName: string) => {
    onChange(serializeLinkContent(newName, url));
  }, [onChange, url]);

  const handleUrlChange = useCallback((newUrl: string) => {
    onChange(serializeLinkContent(name, newUrl));
  }, [onChange, name]);

  const handleLinkClick = useCallback((e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      e.stopPropagation();
      e.preventDefault();
    }
  }, [url]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
      onSetEditing?.(false);
    }
    if (e.key === 'Delete' || e.key === 'Backspace') e.stopPropagation();
    if (e.key === 'Enter') {
      e.stopPropagation();
      e.preventDefault();
      // Tab from name to URL, or close if on URL
      if (e.target === nameInputRef.current) {
        urlInputRef.current?.focus();
      } else if (e.target === urlInputRef.current) {
        onSetEditing?.(false);
      }
    }
    // Allow Tab to move between fields
    if (e.key === 'Tab') {
      e.stopPropagation();
    }
  }, [onSetEditing]);

  useEffect(() => {
    if (isEditing && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditing]);

  // Handle blur - only exit edit mode if focus leaves the container entirely
  const handleBlur = useCallback((e: React.FocusEvent) => {
    // Check if the new focus target is still within our container
    setTimeout(() => {
      if (containerRef.current && !containerRef.current.contains(document.activeElement)) {
        onSetEditing?.(false);
      }
    }, 50);
  }, [onSetEditing]);

  if (isEditing) {
    return (
      <div 
        ref={containerRef}
        className={styles.linkEditContainer} 
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.linkEditRow}>
          <label className={styles.linkEditLabel}>Name</label>
          <input
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Display text"
            className={styles.linkNameInput}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
          />
        </div>
        <div className={styles.linkEditRow}>
          <label className={styles.linkEditLabel}>URL</label>
          <input
            ref={urlInputRef}
            type="url"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://..."
            className={styles.linkUrlInput}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.linkDisplayInline} style={textStyles} onClick={handleLinkClick}>
      <span className={styles.linkTextInline}>{name || url || 'Add link'}</span>
      {url && <span className={styles.linkIconInline}>↗</span>}
    </div>
  );
});
