import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import type { Block as BlockType, BlockStyle } from '@/shared/types';
import { DEFAULT_STYLE } from '@/shared/types';
import { getBlockStyles, getTextStyles, parseLinkContent, serializeLinkContent } from '@/shared/utils/blockStyles';
import { 
  CanvasDimensions,
  refToPx,
  pxToRef,
  scaleFontSize,
  REFERENCE_WIDTH,
  REFERENCE_HEIGHT,
} from '@/lib/canvas';
import { ObjectControls } from './ObjectControls';
import styles from './Block.module.css';

// Resize edge types
type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null;

// Hit zone size for edge detection
const EDGE_HIT_ZONE = 8;

// Detect which edge/corner the mouse is near (uses cached rect for performance)
function detectResizeEdgeFromRect(
  clientX: number,
  clientY: number,
  rect: DOMRect
): ResizeEdge {
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const w = rect.width;
  const h = rect.height;

  const nearLeft = x < EDGE_HIT_ZONE;
  const nearRight = x > w - EDGE_HIT_ZONE;
  const nearTop = y < EDGE_HIT_ZONE;
  const nearBottom = y > h - EDGE_HIT_ZONE;

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
}: BlockProps) {
  const blockRef = useRef<HTMLDivElement>(null);
  const [interactionState, setInteractionState] = useState<'idle' | 'dragging' | 'resizing'>('idle');
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

  // Calculate inline styles
  const blockStyles = useMemo(() => {
    return getBlockStyles(block.style, block.width, block.height);
  }, [block.style, block.width, block.height]);

  // Handle mouse move for edge detection (hover cursor)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (interactionState !== 'idle') return;
    if (!selected) {
      setHoveredEdge(null);
      return;
    }

    if (!blockRef.current) return;
    const rect = blockRef.current.getBoundingClientRect();
    const edge = detectResizeEdgeFromRect(e.clientX, e.clientY, rect);
    setHoveredEdge(edge);
  }, [selected, interactionState]);

  // Unified interaction start handler for both mouse and touch
  const handleInteractionStart = useCallback((clientX: number, clientY: number, target: HTMLElement, preventDefault: () => void) => {
    if (target.dataset.resize) return;
    if (target.dataset.delete) return;

    const tag = target.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      if (!selected) onSelect();
      return;
    }

    // Cache the rect once at interaction start
    const rect = blockRef.current?.getBoundingClientRect();
    if (!rect) return;

    const edge = selected ? detectResizeEdgeFromRect(clientX, clientY, rect) : null;
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
  }, [block.x, block.y, block.width, block.height, block.style?.fontSize, block.type, block.id, selected, selectedIds, allBlocks, dims.scale, onSelect]);

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

  // Unified mouse move/up handler for drag and resize
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
          const newRefX = Math.max(0, ref.blockX + dx);
          const newRefY = Math.max(0, ref.blockY + dy);
          
          // Apply to DOM in pixels for visual feedback (include offset for centering)
          blockRef.current.style.left = `${newRefX * scale + ref.offsetX}px`;
          blockRef.current.style.top = `${newRefY * scale + ref.offsetY}px`;
        } else if (interactionState === 'resizing') {
          const edge = ref.edge;
          const isTextOrLink = block.type === 'TEXT' || block.type === 'LINK';
          const minWidth = isTextOrLink ? 80 : 50;
          const minHeight = isTextOrLink ? 40 : 30;

          if (isTextOrLink) {
            // For TEXT/LINK: edge drag scales font size proportionally
            // Calculate scale based on drag direction (use pixel deltas for sensitivity)
            let fontScale = 1;
            const sensitivity = 0.005; // How fast font scales with drag

            if (edge === 'e') {
              fontScale = 1 + pxDx * sensitivity;
            } else if (edge === 'w') {
              fontScale = 1 - pxDx * sensitivity;
            } else if (edge === 's') {
              fontScale = 1 + pxDy * sensitivity;
            } else if (edge === 'n') {
              fontScale = 1 - pxDy * sensitivity;
            } else if (edge === 'se') {
              fontScale = 1 + (pxDx + pxDy) * 0.5 * sensitivity;
            } else if (edge === 'sw') {
              fontScale = 1 + (-pxDx + pxDy) * 0.5 * sensitivity;
            } else if (edge === 'ne') {
              fontScale = 1 + (pxDx - pxDy) * 0.5 * sensitivity;
            } else if (edge === 'nw') {
              fontScale = 1 + (-pxDx - pxDy) * 0.5 * sensitivity;
            }

            // Clamp font scale
            fontScale = Math.max(0.5, Math.min(2.5, fontScale));

            // Apply visual scaling via CSS transform for smooth feedback
            blockRef.current.style.transform = `scale(${fontScale})`;
            blockRef.current.style.transformOrigin = edge === 'e' || edge === 'se' || edge === 'ne' ? 'left center' :
                                                      edge === 'w' || edge === 'sw' || edge === 'nw' ? 'right center' :
                                                      edge === 'n' ? 'center bottom' :
                                                      edge === 's' ? 'center top' : 'center center';
          } else {
            // For other blocks: resize dimensions (in reference coordinates)
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
            blockRef.current.style.left = `${newX * scale + ref.offsetX}px`;
            blockRef.current.style.top = `${newY * scale + ref.offsetY}px`;
            blockRef.current.style.width = `${newWidth * scale}px`;
            blockRef.current.style.height = `${newHeight * scale}px`;
          }
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
          const newX = Math.max(0, ref.blockX + dx);
          const newY = Math.max(0, ref.blockY + dy);
          if (newX !== block.x || newY !== block.y) {
            onUpdate({ x: newX, y: newY });
          }
        }
        
      // If it was just a click on a TEXT or LINK block's interior (not edge), enter edit mode
      // Use a small delay to allow ObjectControls to fully render and stabilize first
      if (wasJustClick && (block.type === 'TEXT' || block.type === 'LINK') && !ref.edge) {
        setTimeout(() => {
          onSetEditing?.(true);
        }, 50);
      }
      } else if (interactionState === 'resizing') {
        const edge = ref.edge;
        const isTextOrLink = block.type === 'TEXT' || block.type === 'LINK';
        const minWidth = isTextOrLink ? 80 : 50;
        const minHeight = isTextOrLink ? 40 : 30;

        if (isTextOrLink) {
          // Reset the CSS transform
          if (blockRef.current) {
            blockRef.current.style.transform = '';
            blockRef.current.style.transformOrigin = '';
          }

          // For TEXT/LINK: edge drag scales font size proportionally
          // Use pixel deltas for consistent sensitivity feel
          const sensitivity = 0.005;
          let fontScale = 1;

          if (edge === 'e') {
            fontScale = 1 + pxDx * sensitivity;
          } else if (edge === 'w') {
            fontScale = 1 - pxDx * sensitivity;
          } else if (edge === 's') {
            fontScale = 1 + pxDy * sensitivity;
          } else if (edge === 'n') {
            fontScale = 1 - pxDy * sensitivity;
          } else if (edge === 'se') {
            fontScale = 1 + (pxDx + pxDy) * 0.5 * sensitivity;
          } else if (edge === 'sw') {
            fontScale = 1 + (-pxDx + pxDy) * 0.5 * sensitivity;
          } else if (edge === 'ne') {
            fontScale = 1 + (pxDx - pxDy) * 0.5 * sensitivity;
          } else if (edge === 'nw') {
            fontScale = 1 + (-pxDx - pxDy) * 0.5 * sensitivity;
          }

          // Clamp font scale
          fontScale = Math.max(0.5, Math.min(2.5, fontScale));

          // Calculate new font size (still in reference units)
          let newFontSize = Math.round(ref.fontSize * fontScale);
          newFontSize = Math.max(10, newFontSize);

          // Scale block dimensions proportionally with font size (in reference coords)
          const sizeScale = newFontSize / ref.fontSize;
          const newWidth = Math.max(minWidth, Math.round(ref.blockWidth * sizeScale));
          const newHeight = Math.max(minHeight, Math.round(ref.blockHeight * sizeScale));

          const updates: Partial<BlockType> = {
            width: newWidth,
            height: newHeight,
            style: {
              ...DEFAULT_STYLE,
              ...block.style,
              fontSize: newFontSize,
            },
          };

          onUpdate(updates);
        } else {
          // For other blocks: resize dimensions (in reference coordinates)
          const updates: Partial<BlockType> = {};
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

          onUpdate(updates);
        }
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

  // Handle text measurement - auto-resize block to fit text content
  const handleTextMeasure = useCallback((measuredWidth: number, measuredHeight: number) => {
    // Only expand, don't shrink (to allow user sizing)
    // Add a small buffer for safety
    const buffer = 4;
    const needsWidthUpdate = measuredWidth > block.width - buffer;
    const needsHeightUpdate = measuredHeight > block.height - buffer;
    
    if (needsWidthUpdate || needsHeightUpdate) {
      const newWidth = needsWidthUpdate ? Math.ceil(measuredWidth + buffer) : block.width;
      const newHeight = needsHeightUpdate ? Math.ceil(measuredHeight + buffer) : block.height;
      onUpdate({ width: newWidth, height: newHeight });
    }
  }, [block.width, block.height, onUpdate]);

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

  const isTextOrLinkBlock = block.type === 'TEXT' || block.type === 'LINK';
  const isFontScaling = interactionState === 'resizing' && isTextOrLinkBlock;

  const classNames = [
    styles.block,
    styles[block.type.toLowerCase()],
    selected ? styles.selected : '',
    multiSelected ? styles.multiSelected : '',
    interactionState === 'dragging' ? styles.dragging : '',
    isFontScaling ? styles.fontScaling : '',
    isNew ? styles.entering : '',
    isEditing ? styles.editing : '',
  ].filter(Boolean).join(' ');

  // Compute pixel positions from reference coordinates
  const pxRect = useMemo(() => refToPx(
    { x: block.x, y: block.y, width: block.width, height: block.height },
    dims
  ), [block.x, block.y, block.width, block.height, dims]);
  
  // Scale font size for rendering
  const scaledFontSize = useMemo(() => {
    const baseFontSize = block.style?.fontSize || DEFAULT_STYLE.fontSize || 16;
    return scaleFontSize(baseFontSize, dims.scale);
  }, [block.style?.fontSize, dims.scale]);

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
        ...blockStyles.outer,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredEdge(null)}
      onDoubleClick={handleDoubleClick}
      onTouchStart={handleTouchStart}
    >
      <div className={styles.blockInner} style={blockStyles.inner}>
        <BlockContent
          type={block.type}
          content={block.content}
          style={block.style}
          scaledFontSize={scaledFontSize}
          canvasScale={dims.scale}
          onChange={handleContentChange}
          onImageLoad={handleImageLoad}
          onTextMeasure={handleTextMeasure}
          selected={selected}
          isEditing={isEditing}
          onSetEditing={onSetEditing}
        />
      </div>

      {selected && (block.type === 'IMAGE' || block.type === 'TEXT' || block.type === 'LINK') && (
        <ObjectControls
          blockType={block.type}
          style={block.style}
          onChange={handleStyleChange}
          onChangeMultiple={onUpdateMultiple ? (updates) => onUpdateMultiple(selectedIds, { style: { ...DEFAULT_STYLE, ...block.style, ...updates } }) : undefined}
          multiSelected={multiSelected}
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
  onChange,
  onImageLoad,
  onTextMeasure,
  selected,
  isEditing,
  onSetEditing,
}: BlockContentProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Get text styles but override fontSize with scaled version
  const textStyles = useMemo(() => {
    const baseStyles = getTextStyles(style);
    if (scaledFontSize) {
      return {
        ...baseStyles,
        fontSize: `${scaledFontSize}px`,
        // Scale padding proportionally too
        padding: `${Math.round(scaledFontSize * 0.1)}px ${Math.round(scaledFontSize * 0.15)}px`,
      };
    }
    return baseStyles;
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
  useEffect(() => {
    if ((type === 'TEXT') && content && onTextMeasure) {
      // Create a hidden measurement element
      const measureEl = document.createElement('div');
      measureEl.style.cssText = `
        position: absolute;
        visibility: hidden;
        height: auto;
        width: auto;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: ${textStyles.fontFamily || 'inherit'};
        font-size: ${textStyles.fontSize || '16px'};
        font-weight: ${textStyles.fontWeight || 'normal'};
        line-height: 1.4;
        padding: ${textStyles.padding || '0'};
      `;
      measureEl.textContent = content;
      document.body.appendChild(measureEl);
      
      const measuredWidth = measureEl.offsetWidth;
      const measuredHeight = measureEl.offsetHeight;
      
      document.body.removeChild(measureEl);
      
      onTextMeasure(measuredWidth, measuredHeight);
    }
  }, [type, content, style, textStyles, onTextMeasure]);

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

  // Get text styles but override fontSize with scaled version
  const textStyles = useMemo(() => {
    const baseStyles = getTextStyles(style);
    if (scaledFontSize) {
      return {
        ...baseStyles,
        fontSize: `${scaledFontSize}px`,
        padding: `${Math.round(scaledFontSize * 0.1)}px ${Math.round(scaledFontSize * 0.15)}px`,
      };
    }
    return baseStyles;
  }, [style, scaledFontSize]);

  // Measure link display and report dimensions using a hidden measurement element
  useEffect(() => {
    if (onTextMeasure && !isEditing) {
      const displayText = name || url || 'Add link';
      const measureEl = document.createElement('div');
      measureEl.style.cssText = `
        position: absolute;
        visibility: hidden;
        height: auto;
        width: auto;
        white-space: pre-wrap;
        word-break: break-word;
        display: flex;
        align-items: center;
        gap: 4px;
        font-family: ${textStyles.fontFamily || 'inherit'};
        font-size: ${textStyles.fontSize || '16px'};
        font-weight: ${textStyles.fontWeight || 'normal'};
        line-height: 1.5;
        padding: ${textStyles.padding || '0'};
      `;
      measureEl.innerHTML = `<span>${displayText}</span>${url ? '<span style="font-size: 0.75em;">↗</span>' : ''}`;
      document.body.appendChild(measureEl);
      
      const measuredWidth = measureEl.offsetWidth;
      const measuredHeight = measureEl.offsetHeight;
      
      document.body.removeChild(measureEl);
      
      onTextMeasure(measuredWidth, measuredHeight);
    }
  }, [content, name, url, style, textStyles, onTextMeasure, isEditing]);

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
