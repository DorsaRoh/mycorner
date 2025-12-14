import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import type { Block as BlockType, BlockStyle } from '@/shared/types';
import { DEFAULT_STYLE } from '@/shared/types';
import { getBlockStyles, getTextStyles, parseLinkContent, serializeLinkContent } from '@/shared/utils/blockStyles';
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
  onSelect: () => void;
  onUpdate: (updates: Partial<BlockType>) => void;
  onUpdateMultiple?: (ids: Set<string>, updates: Partial<BlockType>) => void;
  selectedIds?: Set<string>;
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
  onSelect,
  onUpdate,
  onUpdateMultiple,
  selectedIds = new Set(),
  onDelete,
  onSetEditing,
}: BlockProps) {
  const blockRef = useRef<HTMLDivElement>(null);
  const [interactionState, setInteractionState] = useState<'idle' | 'dragging' | 'resizing'>('idle');
  const [hoveredEdge, setHoveredEdge] = useState<ResizeEdge>(null);
  
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
    if ((block.type === 'TEXT' || block.type === 'LINK') && newStyle.fontSize) {
      const oldFontSize = block.style?.fontSize || DEFAULT_STYLE.fontSize || 16;
      const newFontSize = newStyle.fontSize;

      if (oldFontSize !== newFontSize) {
        const scale = newFontSize / oldFontSize;
        const newWidth = Math.max(100, Math.round(block.width * scale));
        const newHeight = Math.max(40, Math.round(block.height * scale));

        onUpdate({
          style: newStyle,
          width: newWidth,
          height: newHeight,
        });
        return;
      }
    }

    onUpdate({ style: newStyle });
  }, [onUpdate, block.type, block.style?.fontSize, block.width, block.height]);

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

  // Drag/resize handling with rAF optimization
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).dataset.resize) return;
    if ((e.target as HTMLElement).dataset.delete) return;

    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      if (!selected) onSelect();
      return;
    }

    e.stopPropagation();

    // Cache the rect once at interaction start
    const rect = blockRef.current?.getBoundingClientRect();
    if (!rect) return;

    const edge = selected ? detectResizeEdgeFromRect(e.clientX, e.clientY, rect) : null;
    const isTextOrLink = block.type === 'TEXT' || block.type === 'LINK';

    // Store initial values in ref (no state update)
    interactionRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      blockX: block.x,
      blockY: block.y,
      blockWidth: block.width,
      blockHeight: block.height,
      fontSize: block.style?.fontSize || DEFAULT_STYLE.fontSize || 16,
      edge,
      cachedRect: rect,
      rafId: 0,
    };

    // For TEXT/LINK: edges are for font-size resizing, middle is for dragging
    // For other blocks: edges are for resizing, interior is for dragging
    if (isTextOrLink) {
      if (edge && selected) {
        // Edge drag on TEXT/LINK = font size scaling
        e.preventDefault();
        setInteractionState('resizing');
      } else {
        // Middle drag on TEXT/LINK = move the block
        onSelect();
        setInteractionState('dragging');
      }
    } else if (edge && selected) {
      e.preventDefault();
      setInteractionState('resizing');
    } else {
      onSelect();
      setInteractionState('dragging');
    }
  }, [block.x, block.y, block.width, block.height, block.style?.fontSize, selected, onSelect]);

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
        const dx = e.clientX - ref.startX;
        const dy = e.clientY - ref.startY;

        if (!blockRef.current) return;

        if (interactionState === 'dragging') {
          // Apply transform directly to DOM for smooth dragging
          const newX = Math.max(0, ref.blockX + dx);
          const newY = Math.max(0, ref.blockY + dy);
          blockRef.current.style.left = `${newX}px`;
          blockRef.current.style.top = `${newY}px`;
        } else if (interactionState === 'resizing') {
          const edge = ref.edge;
          const isTextOrLink = block.type === 'TEXT' || block.type === 'LINK';
          const minWidth = isTextOrLink ? 80 : 50;
          const minHeight = isTextOrLink ? 40 : 30;

          if (isTextOrLink) {
            // For TEXT/LINK: edge drag scales font size proportionally
            // Calculate scale based on drag direction
            let scale = 1;
            const sensitivity = 0.005; // How fast font scales with drag

            if (edge === 'e') {
              scale = 1 + dx * sensitivity;
            } else if (edge === 'w') {
              scale = 1 - dx * sensitivity;
            } else if (edge === 's') {
              scale = 1 + dy * sensitivity;
            } else if (edge === 'n') {
              scale = 1 - dy * sensitivity;
            } else if (edge === 'se') {
              scale = 1 + (dx + dy) * 0.5 * sensitivity;
            } else if (edge === 'sw') {
              scale = 1 + (-dx + dy) * 0.5 * sensitivity;
            } else if (edge === 'ne') {
              scale = 1 + (dx - dy) * 0.5 * sensitivity;
            } else if (edge === 'nw') {
              scale = 1 + (-dx - dy) * 0.5 * sensitivity;
            }

            // Clamp scale
            scale = Math.max(0.5, Math.min(2.5, scale));

            // Apply visual scaling via CSS transform for smooth feedback
            blockRef.current.style.transform = `scale(${scale})`;
            blockRef.current.style.transformOrigin = edge === 'e' || edge === 'se' || edge === 'ne' ? 'left center' :
                                                      edge === 'w' || edge === 'sw' || edge === 'nw' ? 'right center' :
                                                      edge === 'n' ? 'center bottom' :
                                                      edge === 's' ? 'center top' : 'center center';
          } else {
            // For other blocks: resize dimensions
            let newWidth = ref.blockWidth;
            let newHeight = ref.blockHeight;
            let newX = ref.blockX;
            let newY = ref.blockY;

            // Calculate new dimensions based on edge
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

            // Apply directly to DOM for smooth resizing
            blockRef.current.style.left = `${newX}px`;
            blockRef.current.style.top = `${newY}px`;
            blockRef.current.style.width = `${newWidth}px`;
            blockRef.current.style.height = `${newHeight}px`;
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
      const dx = e.clientX - ref.startX;
      const dy = e.clientY - ref.startY;
      
      // Check if this was just a click (minimal movement) vs actual drag
      const wasJustClick = Math.abs(dx) < 5 && Math.abs(dy) < 5;

      // Commit final state to React
      if (interactionState === 'dragging') {
        const newX = Math.max(0, ref.blockX + dx);
        const newY = Math.max(0, ref.blockY + dy);
        if (newX !== block.x || newY !== block.y) {
          onUpdate({ x: newX, y: newY });
        }
        
        // If it was just a click on a TEXT or LINK block's interior (not edge), enter edit mode
        if (wasJustClick && (block.type === 'TEXT' || block.type === 'LINK') && !ref.edge) {
          onSetEditing?.(true);
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
          const sensitivity = 0.005;
          let scale = 1;

          if (edge === 'e') {
            scale = 1 + dx * sensitivity;
          } else if (edge === 'w') {
            scale = 1 - dx * sensitivity;
          } else if (edge === 's') {
            scale = 1 + dy * sensitivity;
          } else if (edge === 'n') {
            scale = 1 - dy * sensitivity;
          } else if (edge === 'se') {
            scale = 1 + (dx + dy) * 0.5 * sensitivity;
          } else if (edge === 'sw') {
            scale = 1 + (-dx + dy) * 0.5 * sensitivity;
          } else if (edge === 'ne') {
            scale = 1 + (dx - dy) * 0.5 * sensitivity;
          } else if (edge === 'nw') {
            scale = 1 + (-dx - dy) * 0.5 * sensitivity;
          }

          // Clamp scale
          scale = Math.max(0.5, Math.min(2.5, scale));

          // Calculate new font size
          let newFontSize = Math.round(ref.fontSize * scale);
          newFontSize = Math.max(10, newFontSize);

          // Scale block dimensions proportionally with font size
          const fontScale = newFontSize / ref.fontSize;
          const newWidth = Math.max(minWidth, Math.round(ref.blockWidth * fontScale));
          const newHeight = Math.max(minHeight, Math.round(ref.blockHeight * fontScale));

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
          // For other blocks: resize dimensions
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

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (interactionRef.current.rafId) {
        cancelAnimationFrame(interactionRef.current.rafId);
      }
    };
  }, [interactionState, block.x, block.y, block.type, block.style, onUpdate, onSetEditing]);

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

  return (
    <div
      ref={blockRef}
      className={classNames}
      style={{
        left: block.x,
        top: block.y,
        width: block.width,
        height: block.height,
        cursor: cursorStyle,
        ...blockStyles.outer,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredEdge(null)}
      onDoubleClick={handleDoubleClick}
    >
      <div className={styles.blockInner} style={blockStyles.inner}>
        <BlockContent
          type={block.type}
          content={block.content}
          style={block.style}
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
  onChange,
  onImageLoad,
  onTextMeasure,
  selected,
  isEditing,
  onSetEditing,
}: BlockContentProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const textStyles = useMemo(() => getTextStyles(style), [style]);

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
              if (e.key === 'Enter') e.stopPropagation();
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
  onChange: (content: string) => void;
  onTextMeasure?: (width: number, height: number) => void;
  selected: boolean;
  isEditing?: boolean;
  onSetEditing?: (editing: boolean) => void;
}

const LinkBlockContent = memo(function LinkBlockContent({
  content,
  style,
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

  const textStyles = useMemo(() => getTextStyles(style), [style]);

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
