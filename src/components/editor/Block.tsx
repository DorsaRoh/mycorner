import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Block as BlockType, BlockStyle, BlockEffects } from '@/shared/types';
import { DEFAULT_STYLE, hasActiveStyle } from '@/shared/types';
import { EffectsRenderer, hasActiveEffects } from '@/components/effects';
import { EffectsPanel } from '@/components/effects';
import { StylePanel } from './StylePanel';
import styles from './Block.module.css';

// Convert BlockStyle to inline CSS styles
function getInlineStyles(style?: BlockStyle, blockWidth?: number, blockHeight?: number): React.CSSProperties {
  if (!style) return {};
  
  const s = { ...DEFAULT_STYLE, ...style };
  const size = Math.min(blockWidth || 200, blockHeight || 200);
  
  // Calculate actual values from normalized 0-1 ranges
  const borderRadiusPx = s.borderRadius * (size / 2); // Max is half of smallest dimension (circle)
  const borderWidthPx = s.borderWidth * 12; // Max 12px border
  const borderSoftnessPx = s.borderSoftness * 8; // Max 8px blur for softness
  
  // Shadow calculations
  const shadowBlurPx = s.shadowSoftness * 40; // Max 40px blur
  const shadowOffsetXPx = s.shadowOffsetX * 30; // Max 30px offset
  const shadowOffsetYPx = s.shadowOffsetY * 30;
  const shadowOpacity = s.shadowStrength * 0.5; // Max 50% opacity
  
  const result: React.CSSProperties = {
    opacity: s.opacity,
  };
  
  // Border radius
  if (s.borderRadius > 0) {
    result.borderRadius = `${borderRadiusPx}px`;
  }
  
  // Border - combine with softness for soft edge effect
  if (s.borderWidth > 0) {
    result.outline = `${borderWidthPx}px solid ${s.borderColor}`;
    result.outlineOffset = `-${borderWidthPx / 2}px`;
    
    // Add soft edge using box-shadow if borderSoftness > 0
    if (s.borderSoftness > 0) {
      const softEdge = `0 0 ${borderSoftnessPx}px ${borderSoftnessPx / 2}px ${s.borderColor}`;
      if (s.shadowStrength > 0) {
        result.boxShadow = `${softEdge}, ${shadowOffsetXPx}px ${shadowOffsetYPx}px ${shadowBlurPx}px rgba(0, 0, 0, ${shadowOpacity})`;
      } else {
        result.boxShadow = softEdge;
      }
    } else if (s.shadowStrength > 0) {
      result.boxShadow = `${shadowOffsetXPx}px ${shadowOffsetYPx}px ${shadowBlurPx}px rgba(0, 0, 0, ${shadowOpacity})`;
    }
  } else {
    // No border, but maybe soft edge or shadow
    if (s.borderSoftness > 0) {
      const softEdge = `0 0 ${borderSoftnessPx}px ${borderSoftnessPx / 2}px ${s.borderColor}`;
      if (s.shadowStrength > 0) {
        result.boxShadow = `${softEdge}, ${shadowOffsetXPx}px ${shadowOffsetYPx}px ${shadowBlurPx}px rgba(0, 0, 0, ${shadowOpacity})`;
      } else {
        result.boxShadow = softEdge;
      }
    } else if (s.shadowStrength > 0) {
      result.boxShadow = `${shadowOffsetXPx}px ${shadowOffsetYPx}px ${shadowBlurPx}px rgba(0, 0, 0, ${shadowOpacity})`;
    }
  }
  
  return result;
}

interface BlockProps {
  block: BlockType;
  selected: boolean;
  multiSelected?: boolean;
  isNew?: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<BlockType>) => void;
  onDelete: () => void;
}

export function Block({ block, selected, multiSelected = false, isNew = false, onSelect, onUpdate, onDelete }: BlockProps) {
  const blockRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [showStylePanel, setShowStylePanel] = useState(false);
  const [showEffectsPanel, setShowEffectsPanel] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, blockX: 0, blockY: 0 });
  const resizeStart = useRef({ width: 0, height: 0, mouseX: 0, mouseY: 0 });

  // Close panels when block is deselected
  useEffect(() => {
    if (!selected) {
      setShowStylePanel(false);
      setShowEffectsPanel(false);
    }
  }, [selected]);

  // Handle style update
  const handleStyleChange = useCallback((style: BlockStyle) => {
    onUpdate({ style });
  }, [onUpdate]);

  // Handle effects update
  const handleEffectsChange = useCallback((effects: BlockEffects) => {
    onUpdate({ effects });
  }, [onUpdate]);
  
  // Calculate inline styles for the block
  const inlineStyles = useMemo(() => {
    return getInlineStyles(block.style, block.width, block.height);
  }, [block.style, block.width, block.height]);

  // Drag handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).dataset.resize) return;
    if ((e.target as HTMLElement).dataset.delete) return;
    e.stopPropagation();
    onSelect();
    setDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      blockX: block.x,
      blockY: block.y,
    };
  }, [block.x, block.y, onSelect]);

  // Resize handling
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    setResizing(true);
    resizeStart.current = {
      width: block.width,
      height: block.height,
      mouseX: e.clientX,
      mouseY: e.clientY,
    };
  }, [block.width, block.height, onSelect]);

  useEffect(() => {
    if (!dragging && !resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (dragging) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        onUpdate({
          x: Math.max(0, dragStart.current.blockX + dx),
          y: Math.max(0, dragStart.current.blockY + dy),
        });
      }
      if (resizing) {
        const dx = e.clientX - resizeStart.current.mouseX;
        const dy = e.clientY - resizeStart.current.mouseY;
        onUpdate({
          width: Math.max(50, resizeStart.current.width + dx),
          height: Math.max(30, resizeStart.current.height + dy),
        });
      }
    };

    const handleMouseUp = () => {
      setDragging(false);
      setResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, resizing, onUpdate]);

  const handleContentChange = useCallback((content: string) => {
    onUpdate({ content });
  }, [onUpdate]);

  // Handle image load to get natural dimensions
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    
    // Only update if dimensions are different and image just loaded
    // Cap the max size to reasonable bounds
    const maxWidth = 500;
    const maxHeight = 400;
    
    let newWidth = naturalWidth;
    let newHeight = naturalHeight;
    
    // Scale down if too large, maintaining aspect ratio
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
    
    // Minimum size
    newWidth = Math.max(100, newWidth);
    newHeight = Math.max(60, newHeight);
    
    // Only update if significantly different from current
    if (Math.abs(block.width - newWidth) > 10 || Math.abs(block.height - newHeight) > 10) {
      onUpdate({ width: newWidth, height: newHeight });
    }
  }, [block.width, block.height, onUpdate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && selected && block.content === '') {
      e.preventDefault();
      onDelete();
    }
  }, [selected, block.content, onDelete]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onDelete();
  }, [onDelete]);

  const classNames = [
    styles.block,
    styles[block.type.toLowerCase()],
    selected ? styles.selected : '',
    multiSelected ? styles.multiSelected : '',
    dragging ? styles.dragging : '',
    isNew ? styles.entering : '',
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
        ...inlineStyles,
      }}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.blockInner}>
        <BlockContent
          type={block.type}
          content={block.content}
          style={block.style}
          effects={block.effects}
          onChange={handleContentChange}
          onImageLoad={handleImageLoad}
          selected={selected}
        />
      </div>
      
      {/* Floating control bar - appears when selected */}
      {selected && (
        <div className={styles.controlBar} onMouseDown={(e) => e.stopPropagation()}>
          {/* Style & Effects buttons for image blocks */}
          {block.type === 'IMAGE' && block.content && (
            <>
              <button
                className={`${styles.styleBtn} ${hasActiveStyle(block.style) ? styles.styleBtnActive : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowStylePanel(!showStylePanel);
                  setShowEffectsPanel(false);
                }}
                title="Style"
              >
                ◐
              </button>
              <button
                className={`${styles.effectsBtn} ${hasActiveEffects(block.effects) ? styles.effectsBtnActive : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEffectsPanel(!showEffectsPanel);
                  setShowStylePanel(false);
                }}
                title="Effects"
              >
                ✦
              </button>
              <div className={styles.controlDivider} />
            </>
          )}
          
          {/* Delete button - always visible */}
          <button 
            className={styles.deleteBtn}
            data-delete="true"
            onClick={handleDeleteClick}
            aria-label="Delete block"
          >
            ×
          </button>
        </div>
      )}
      
      {/* Style panel */}
      {selected && showStylePanel && block.type === 'IMAGE' && (
        <StylePanel
          style={block.style}
          onChange={handleStyleChange}
          onClose={() => setShowStylePanel(false)}
        />
      )}
      
      {/* Effects panel */}
      {selected && showEffectsPanel && block.type === 'IMAGE' && (
        <EffectsPanel
          effects={block.effects}
          onChange={handleEffectsChange}
          onClose={() => setShowEffectsPanel(false)}
        />
      )}
      
      {/* Resize handle - subtle, only when selected */}
      {selected && (
        <div
          className={styles.resizeHandle}
          data-resize="true"
          onMouseDown={handleResizeStart}
        />
      )}
    </div>
  );
}

interface BlockContentProps {
  type: BlockType['type'];
  content: string;
  style?: BlockStyle;
  effects?: BlockEffects;
  onChange: (content: string) => void;
  onImageLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  selected: boolean;
}

// Parse link content - supports both simple URLs and {name, url} JSON format
function parseLinkContent(content: string): { name: string; url: string } {
  if (!content) return { name: '', url: '' };
  
  try {
    const parsed = JSON.parse(content);
    if (parsed.url) {
      return { name: parsed.name || '', url: parsed.url };
    }
  } catch {
    // Not JSON, treat as simple URL
  }
  
  // Simple URL string - extract hostname as default name
  try {
    const url = new URL(content);
    return { name: url.hostname.replace('www.', ''), url: content };
  } catch {
    return { name: content, url: content };
  }
}

// Serialize link content to JSON
function serializeLinkContent(name: string, url: string): string {
  return JSON.stringify({ name, url });
}

interface LinkBlockContentProps {
  content: string;
  onChange: (content: string) => void;
  selected: boolean;
}

function LinkBlockContent({ content, onChange, selected }: LinkBlockContentProps) {
  const { name, url } = parseLinkContent(content);
  
  const handleNameChange = (newName: string) => {
    onChange(serializeLinkContent(newName, url));
  };
  
  const handleUrlChange = (newUrl: string) => {
    // Auto-generate name from URL if name is empty or was auto-generated
    let newName = name;
    try {
      const oldHostname = url ? new URL(url).hostname.replace('www.', '') : '';
      if (!name || name === oldHostname) {
        const urlObj = new URL(newUrl.startsWith('http') ? newUrl : 'https://' + newUrl);
        newName = urlObj.hostname.replace('www.', '');
      }
    } catch {
      // Invalid URL, keep existing name
    }
    onChange(serializeLinkContent(newName, newUrl));
  };
  
  const handleLinkClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    e.stopPropagation();
    e.preventDefault();
  };

  // Edit mode when selected
  if (selected) {
    return (
      <div className={styles.linkContent} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.linkEditRow}>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Name"
            className={styles.linkNameInput}
            autoFocus={!name}
          />
        </div>
        <div className={styles.linkEditRow}>
          <input
            type="url"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://..."
            className={styles.linkUrlInput}
          />
        </div>
      </div>
    );
  }

  // Display mode
  return (
    <div className={styles.linkDisplay}>
      {url ? (
        <a 
          href={url}
          onClick={handleLinkClick}
          className={styles.linkAnchor}
        >
          <span className={styles.linkIcon}>↗</span>
          <span className={styles.linkName}>{name || url}</span>
        </a>
      ) : (
        <span className={styles.linkPlaceholder}>click to add link</span>
      )}
    </div>
  );
}

function BlockContent({ type, content, style, effects, onChange, onImageLoad, selected }: BlockContentProps) {
  switch (type) {
    case 'TEXT':
      return (
        <textarea
          className={styles.textContent}
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type something..."
          autoFocus={selected && !content}
          onMouseDown={(e) => e.stopPropagation()}
        />
      );
    
    case 'IMAGE':
      if (!content) {
        return (
          <div className={styles.imagePlaceholder}>
            <span>No image</span>
          </div>
        );
      }
      
      // Apply effects (style is applied at block level)
      return (
        <EffectsRenderer effects={effects}>
          <div className={styles.imageWrapper}>
            <img 
              src={content} 
              alt="" 
              className={styles.imageContent} 
              draggable={false}
              onLoad={onImageLoad}
            />
          </div>
        </EffectsRenderer>
      );
    
    case 'LINK':
      return (
        <LinkBlockContent 
          content={content} 
          onChange={onChange} 
          selected={selected} 
        />
      );
    
    default:
      return null;
  }
}
