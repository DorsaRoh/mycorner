import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Block as BlockType, BlockType as BlockTypeEnum, BackgroundConfig } from '@/shared/types';
import { Block } from './Block';
import { CreationPalette } from './CreationPalette';
import { uploadAsset, isAcceptedImageType } from '@/lib/upload';
import { isImageUrl, getBackgroundStyles, getMarginOverlayColor } from '@/shared/utils/blockStyles';
import { 
  useCanvasSize, 
  CanvasDimensions,
  pxToRef,
  refToPx,
  REFERENCE_WIDTH,
  REFERENCE_HEIGHT,
  SAFE_ZONE_MARGIN,
} from '@/lib/canvas';
import styles from './Canvas.module.css';

interface PaletteState {
  x: number;  // Screen X for palette positioning
  y: number;  // Screen Y for palette positioning
  refX: number;  // Reference X for block placement
  refY: number;  // Reference Y for block placement
}

interface MarqueeState {
  // Screen coordinates for visual rendering
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface CanvasProps {
  blocks: BlockType[];
  background?: BackgroundConfig;
  selectedId: string | null;
  selectedIds: Set<string>;
  newBlockIds?: Set<string>;
  editingId?: string | null;
  starterMode?: boolean;
  onSelectBlock: (id: string | null) => void;
  onSelectMultiple: (ids: Set<string>) => void;
  onUpdateBlock: (id: string, updates: Partial<BlockType>) => void;
  onUpdateMultipleBlocks: (ids: Set<string>, updates: Partial<BlockType>) => void;
  onDragMultipleBlocks?: (ids: Set<string>, dx: number, dy: number) => void;
  onDeleteBlock: (id: string) => void;
  // Block positions are in reference coordinates (1200x800 reference canvas)
  onAddBlock: (type: BlockType['type'], x: number, y: number, content?: string) => void;
  onSetEditing?: (id: string | null) => void;
  onExitStarterMode?: () => void;
  // Callback to expose canvas dimensions to parent
  onDimensionsChange?: (dims: CanvasDimensions) => void;
  // Called when a drag/resize interaction starts (for undo history)
  onInteractionStart?: () => void;
}

export function Canvas({
  blocks,
  background,
  selectedId,
  selectedIds,
  newBlockIds = new Set(),
  editingId = null,
  starterMode = false,
  onSelectBlock,
  onSelectMultiple,
  onUpdateBlock,
  onDeleteBlock,
  onAddBlock,
  onUpdateMultipleBlocks,
  onDragMultipleBlocks,
  onSetEditing,
  onExitStarterMode,
  onDimensionsChange,
  onInteractionStart,
}: CanvasProps) {
  const [dropError, setDropError] = useState<string | null>(null);
  const [palette, setPalette] = useState<PaletteState | null>(null);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const isMarqueeActive = useRef(false);
  
  // Use responsive canvas sizing with ResizeObserver
  const { dimensions, containerRef, isResizing } = useCanvasSize({
    debounceMs: 16,
    onResizeStart: () => {
      // Cancel active interactions during resize
      setMarquee(null);
      isMarqueeActive.current = false;
    },
  });
  
  // Notify parent of dimension changes
  useEffect(() => {
    onDimensionsChange?.(dimensions);
  }, [dimensions, onDimensionsChange]);
  
  // Keep a ref to dimensions for use in callbacks
  const dimsRef = useRef(dimensions);
  useEffect(() => { dimsRef.current = dimensions; }, [dimensions]);

  // Clear drop error after a delay
  const showDropError = useCallback((message: string) => {
    setDropError(message);
    setTimeout(() => setDropError(null), 3000);
  }, []);

  // Handle mousedown for marquee selection
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const container = containerRef.current;
    
    // Only trigger on canvas or paper sheet (empty areas)
    if (target !== container && !target.classList.contains(styles.paperSheet)) {
      return;
    }
    
    // Close palette if open
    if (palette) {
      setPalette(null);
    }
    
    // Deselect all
    onSelectBlock(null);
    onSelectMultiple(new Set());
    
    if (!container) return;
    
    // Start potential marquee selection (screen coordinates for visual rendering)
    const rect = container.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    isMarqueeActive.current = true;
    setMarquee({
      startX: screenX,
      startY: screenY,
      currentX: screenX,
      currentY: screenY,
    });
  }, [palette, onSelectBlock, onSelectMultiple, containerRef]);

  // Handle click on empty canvas - show creation palette
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const container = containerRef.current;
    
    // Only trigger on canvas or paper sheet (empty areas)
    if (target !== container && !target.classList.contains(styles.paperSheet)) {
      return;
    }
    
    // If we did a marquee selection, don't show palette
    if (marquee && (
      Math.abs(marquee.currentX - marquee.startX) > 5 ||
      Math.abs(marquee.currentY - marquee.startY) > 5
    )) {
      return;
    }
    
    if (!container) return;
    
    // Calculate positions: screen coords for palette, reference coords for block
    const rect = container.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    // Convert screen position to reference coordinates for block placement
    const dims = dimsRef.current;
    const refPos = pxToRef({ x: screenX, y: screenY, width: 0, height: 0 }, dims);
    
    // Show palette at screen location, store reference coords for block
    setPalette({
      x: e.clientX,
      y: e.clientY,
      refX: refPos.x,
      refY: refPos.y,
    });
  }, [marquee, containerRef]);
  
  // Handle marquee mouse move and up
  useEffect(() => {
    if (!marquee) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!isMarqueeActive.current || !container) return;
      
      const rect = container.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      
      setMarquee(prev => prev ? {
        ...prev,
        currentX,
        currentY,
      } : null);
      
      // Convert marquee screen bounds to reference coordinates for block hit testing
      const dims = dimsRef.current;
      const minScreenX = Math.min(marquee.startX, currentX);
      const maxScreenX = Math.max(marquee.startX, currentX);
      const minScreenY = Math.min(marquee.startY, currentY);
      const maxScreenY = Math.max(marquee.startY, currentY);
      
      // Convert screen bounds to reference coords
      const minRef = pxToRef({ x: minScreenX, y: minScreenY, width: 0, height: 0 }, dims);
      const maxRef = pxToRef({ x: maxScreenX, y: maxScreenY, width: 0, height: 0 }, dims);
      
      const selectedBlocks = new Set<string>();
      blocks.forEach(block => {
        // Check if block (in reference coords) overlaps with marquee (in reference coords)
        const blockRight = block.x + block.width;
        const blockBottom = block.y + block.height;
        
        if (block.x < maxRef.x && blockRight > minRef.x && block.y < maxRef.y && blockBottom > minRef.y) {
          selectedBlocks.add(block.id);
        }
      });
      
      if (selectedBlocks.size > 0) {
        onSelectMultiple(selectedBlocks);
      }
    };
    
    const handleMouseUp = () => {
      isMarqueeActive.current = false;
      setMarquee(null);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [marquee, blocks, onSelectMultiple, containerRef]);

  // Handle palette selection - positions are in reference coordinates
  const handlePaletteSelect = useCallback((type: BlockTypeEnum, content?: string) => {
    if (palette) {
      // Exit starter mode when user adds a new block via palette
      if (starterMode) {
        onExitStarterMode?.();
      }
      // Pass reference coordinates for block placement
      onAddBlock(type, palette.refX, palette.refY, content);
      setPalette(null);
    }
  }, [palette, onAddBlock, starterMode, onExitStarterMode]);

  // Close palette
  const handlePaletteClose = useCallback(() => {
    setPalette(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    // Convert screen position to reference coordinates
    const dims = dimsRef.current;
    const refPos = pxToRef({ x: screenX, y: screenY, width: 0, height: 0 }, dims);

    // Handle image file drop
    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(f => f.type.startsWith('image/'));
    
    if (imageFile) {
      // Validate image type
      if (!isAcceptedImageType(imageFile.type)) {
        showDropError('Please use PNG, JPG, WebP, or GIF images');
        return;
      }
      
      // Upload file first, then create block with URL
      const result = await uploadAsset(imageFile);
      if (result.success) {
        onAddBlock('IMAGE', refPos.x, refPos.y, result.data.url);
      } else {
        showDropError(result.error);
      }
      return;
    }

    // Handle URL drop - pass content directly (no upload needed for external URLs)
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (url && url.startsWith('http')) {
      // Check if it's an image URL
      if (isImageUrl(url)) {
        onAddBlock('IMAGE', refPos.x, refPos.y, url);
      } else {
        onAddBlock('LINK', refPos.x, refPos.y, url);
      }
    }
  }, [onAddBlock, showDropError, containerRef]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // Get marquee rect for rendering
  const getMarqueeRect = useCallback(() => {
    if (!marquee) return null;
    const minX = Math.min(marquee.startX, marquee.currentX);
    const minY = Math.min(marquee.startY, marquee.currentY);
    const width = Math.abs(marquee.currentX - marquee.startX);
    const height = Math.abs(marquee.currentY - marquee.startY);
    return { x: minX, y: minY, width, height };
  }, [marquee]);

  const marqueeRect = getMarqueeRect();
  const isMarqueeVisible = marqueeRect && (marqueeRect.width > 5 || marqueeRect.height > 5);

  const { canvasStyle, bgImageStyle } = useMemo(() => getBackgroundStyles(background), [background]);
  
  // Get margin overlay color (slightly lighter than background)
  const marginOverlayColor = useMemo(() => getMarginOverlayColor(background), [background]);
  
  // Calculate margin widths in pixels
  const marginWidth = useMemo(() => {
    return SAFE_ZONE_MARGIN * dimensions.scale;
  }, [dimensions.scale]);

  // Calculate content bounds to ensure canvas can scroll to show all blocks
  const contentBounds = useMemo(() => {
    if (blocks.length === 0) {
      return { 
        width: REFERENCE_WIDTH * dimensions.scale,
        height: REFERENCE_HEIGHT * dimensions.scale 
      };
    }
    
    // Find the maximum extent of all blocks in reference coords
    let maxRefX = REFERENCE_WIDTH;
    let maxRefY = REFERENCE_HEIGHT;
    
    blocks.forEach(block => {
      const blockRight = block.x + block.width;
      const blockBottom = block.y + block.height;
      maxRefX = Math.max(maxRefX, blockRight);
      maxRefY = Math.max(maxRefY, blockBottom);
    });
    
    // Convert to pixels and add some padding
    return {
      width: maxRefX * dimensions.scale + dimensions.offsetX + 40,
      height: maxRefY * dimensions.scale + 40,
    };
  }, [blocks, dimensions]);

  return (
    <div
      ref={containerRef}
      className={styles.canvas}
      style={canvasStyle}
      onMouseDown={handleCanvasMouseDown}
      onClick={handleCanvasClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Content sizer - ensures canvas can scroll to show all content */}
      <div 
        className={styles.contentSizer} 
        style={{ 
          minWidth: contentBounds.width, 
          minHeight: contentBounds.height 
        }} 
      />

      {/* Background image layer (separate for opacity support) */}
      {bgImageStyle && (
        <div className={styles.bgImageLayer} style={bgImageStyle} />
      )}

      {/* Left margin overlay - blocks cannot be placed here */}
      <div 
        className={styles.marginOverlay}
        style={{
          left: dimensions.offsetX,
          width: marginWidth,
          backgroundColor: marginOverlayColor,
        }}
      />
      
      {/* Right margin overlay - blocks cannot be placed here */}
      <div 
        className={styles.marginOverlay}
        style={{
          left: dimensions.offsetX + (REFERENCE_WIDTH - SAFE_ZONE_MARGIN) * dimensions.scale,
          width: marginWidth,
          backgroundColor: marginOverlayColor,
        }}
      />

      {/* Clickable canvas area */}
      <div className={styles.paperSheet} />

      {blocks.map((block) => (
        <Block
          key={block.id}
          block={block}
          selected={selectedId === block.id}
          multiSelected={selectedIds.has(block.id) && selectedId !== block.id}
          isNew={newBlockIds.has(block.id)}
          isEditing={editingId === block.id}
          canvasDimensions={dimensions}
          onSelect={() => onSelectBlock(block.id)}
          onUpdate={(updates) => onUpdateBlock(block.id, updates)}
          onUpdateMultiple={onUpdateMultipleBlocks}
          onDragMultiple={onDragMultipleBlocks}
          selectedIds={selectedIds}
          allBlocks={blocks}
          onDelete={() => onDeleteBlock(block.id)}
          onSetEditing={(editing) => onSetEditing?.(editing ? block.id : null)}
          onInteractionStart={onInteractionStart}
        />
      ))}
      
      
      {/* Marquee selection box - uses screen coordinates */}
      {isMarqueeVisible && (
        <div 
          className={styles.marquee}
          style={{
            left: marqueeRect.x,
            top: marqueeRect.y,
            width: marqueeRect.width,
            height: marqueeRect.height,
          }}
        />
      )}
      
      {/* Drop error message */}
      {dropError && (
        <div className={styles.dropError}>
          {dropError}
        </div>
      )}

      {/* Creation palette - appears at click position */}
      {palette && (
        <CreationPalette
          x={palette.x}
          y={palette.y}
          onSelect={handlePaletteSelect}
          onClose={handlePaletteClose}
        />
      )}
      
      {/* Debug overlay for responsive testing (dev only) */}
      {process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && (window as unknown as { __CANVAS_DEBUG?: boolean }).__CANVAS_DEBUG && (
        <div className={styles.debugOverlay}>
          <div className={styles.debugInfo}>
            {`Canvas: ${dimensions.width.toFixed(0)}×${dimensions.height.toFixed(0)}px\nScale: ${dimensions.scale.toFixed(3)}\nOffset: ${dimensions.offsetX.toFixed(0)}, ${dimensions.offsetY.toFixed(0)}\nRef: 1200×800`}
          </div>
        </div>
      )}
    </div>
  );
}
