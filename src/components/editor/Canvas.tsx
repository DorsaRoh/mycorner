/**
 * Canvas - Editor canvas with full interactivity.
 * 
 * Uses shared CanvasShell for consistent sizing and layering
 * with the viewer, ensuring preview matches published pages.
 * 
 * Features:
 * - Block rendering with selection/editing states
 * - Marquee multi-selection
 * - Creation palette on click
 * - Drag and drop support
 * - Margin overlays for safe zone visualization
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Block as BlockType, BlockType as BlockTypeEnum, BackgroundConfig } from '@/shared/types';
import { Block } from './Block';
import { CreationPalette } from './CreationPalette';
import { CanvasShell, CanvasShellRef } from '@/components/canvas';
import { uploadAsset, isAcceptedImageType } from '@/lib/upload';
import { isImageUrl, getMarginOverlayColor } from '@/shared/utils/blockStyles';
import { 
  CanvasDimensions,
  pxToRef,
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
  // Returns the new block ID for tracking
  onAddBlock: (type: BlockType['type'], x: number, y: number, content?: string) => string;
  onSetEditing?: (id: string | null) => void;
  onExitStarterMode?: () => void;
  // Callback to expose canvas dimensions to parent
  onDimensionsChange?: (dims: CanvasDimensions) => void;
  // Called when a drag/resize interaction starts (for undo history)
  onInteractionStart?: () => void;
  // Called when first interaction happens (removes hint block)
  onFirstInteraction?: () => void;
  // Layer ordering
  onBringForward?: (id: string) => void;
  onSendBackward?: (id: string) => void;
  onBringToFront?: (id: string) => void;
  onSendToBack?: (id: string) => void;
}

// Default dimensions for initial render
const DEFAULT_DIMENSIONS: CanvasDimensions = {
  width: REFERENCE_WIDTH,
  height: REFERENCE_HEIGHT,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
};

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
  onFirstInteraction,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
}: CanvasProps) {
  const [dropError, setDropError] = useState<string | null>(null);
  const [palette, setPalette] = useState<PaletteState | null>(null);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const isMarqueeActive = useRef(false);
  
  // track dimensions in state
  const [dimensions, setDimensions] = useState<CanvasDimensions>(DEFAULT_DIMENSIONS);
  
  // keep a ref to dimensions for use in callbacks
  const dimsRef = useRef(dimensions);
  useEffect(() => { dimsRef.current = dimensions; }, [dimensions]);
  
  // ref to CanvasShell - used to get the actual measurement container for mouse calculations
  const shellRef = useRef<CanvasShellRef>(null);
  
  // Handle dimension changes from shell
  const handleDimensionsChange = useCallback((dims: CanvasDimensions) => {
    setDimensions(dims);
    onDimensionsChange?.(dims);
  }, [onDimensionsChange]);
  
  // Handle resize start - cancel active interactions
  const handleResizeStart = useCallback(() => {
    setMarquee(null);
    isMarqueeActive.current = false;
  }, []);

  // Clear drop error after a delay
  const showDropError = useCallback((message: string) => {
    setDropError(message);
    setTimeout(() => setDropError(null), 3000);
  }, []);

  // handle mousedown for marquee selection
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // only trigger on empty canvas areas
    const isCanvasClick = target.classList.contains(styles.paperSheet) ||
      target.classList.contains(styles.canvas);
    
    if (!isCanvasClick) {
      return;
    }
    
    // close palette if open
    if (palette) {
      setPalette(null);
    }
    
    // deselect all
    onSelectBlock(null);
    onSelectMultiple(new Set());
    
    // get container for position calculation - use shell's container ref for consistency
    const container = shellRef.current?.containerRef.current;
    if (!container) return;
    
    // start potential marquee selection (screen coordinates for visual rendering)
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
  }, [palette, onSelectBlock, onSelectMultiple]);

  // handle click on empty canvas - show creation palette
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // trigger first interaction to hide hint
    onFirstInteraction?.();
    
    // only trigger on empty canvas areas
    const isCanvasClick = target.classList.contains(styles.paperSheet) ||
      target.classList.contains(styles.canvas);
    
    if (!isCanvasClick) {
      return;
    }
    
    // if we did a marquee selection, don't show palette
    if (marquee && (
      Math.abs(marquee.currentX - marquee.startX) > 5 ||
      Math.abs(marquee.currentY - marquee.startY) > 5
    )) {
      return;
    }
    
    // use shell's container ref for consistency with measurement
    const container = shellRef.current?.containerRef.current;
    if (!container) return;
    
    // calculate positions: screen coords for palette, reference coords for block
    const rect = container.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    // convert screen position to reference coordinates for block placement
    const dims = dimsRef.current;
    const refPos = pxToRef({ x: screenX, y: screenY, width: 0, height: 0 }, dims);
    
    // show palette at screen location, store reference coords for block
    setPalette({
      x: e.clientX,
      y: e.clientY,
      refX: refPos.x,
      refY: refPos.y,
    });
  }, [marquee, onFirstInteraction]);
  
  // handle marquee mouse move and up
  useEffect(() => {
    if (!marquee) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      // use shell's container ref for consistency with measurement
      const container = shellRef.current?.containerRef.current;
      if (!isMarqueeActive.current || !container) return;
      
      const rect = container.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      
      setMarquee(prev => prev ? {
        ...prev,
        currentX,
        currentY,
      } : null);
      
      // convert marquee screen bounds to reference coordinates for block hit testing
      const dims = dimsRef.current;
      const minScreenX = Math.min(marquee.startX, currentX);
      const maxScreenX = Math.max(marquee.startX, currentX);
      const minScreenY = Math.min(marquee.startY, currentY);
      const maxScreenY = Math.max(marquee.startY, currentY);
      
      // convert screen bounds to reference coords
      const minRef = pxToRef({ x: minScreenX, y: minScreenY, width: 0, height: 0 }, dims);
      const maxRef = pxToRef({ x: maxScreenX, y: maxScreenY, width: 0, height: 0 }, dims);
      
      const selectedBlocks = new Set<string>();
      blocks.forEach(block => {
        // check if block (in reference coords) overlaps with marquee (in reference coords)
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
  }, [marquee, blocks, onSelectMultiple]);

  // Handle palette selection - positions are in reference coordinates
  const handlePaletteSelect = useCallback((type: BlockTypeEnum, content?: string, file?: File) => {
    if (palette) {
      // Exit starter mode when user adds a new block via palette
      if (starterMode) {
        onExitStarterMode?.();
      }
      // Remove hint on first real interaction
      onFirstInteraction?.();
      
      // For image files, create block immediately with loading state, then upload
      if (type === 'IMAGE' && file && content === '__loading__') {
        // Create block immediately with loading placeholder
        const blockId = onAddBlock(type, palette.refX, palette.refY, '__loading__');
        setPalette(null);
        
        // Upload in background, then update the block by ID
        uploadAsset(file).then(result => {
          if (result.success) {
            onUpdateBlock(blockId, { content: result.data.url });
          } else {
            console.error('Upload failed:', result.error);
            showDropError(result.error);
            onDeleteBlock(blockId);
          }
        });
      } else {
        // Pass reference coordinates for block placement
        onAddBlock(type, palette.refX, palette.refY, content);
        setPalette(null);
      }
    }
  }, [palette, onAddBlock, onUpdateBlock, onDeleteBlock, starterMode, onExitStarterMode, onFirstInteraction, showDropError]);

  // Close palette
  const handlePaletteClose = useCallback(() => {
    setPalette(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // use shell's container ref for consistency with measurement
    const container = shellRef.current?.containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    // convert screen position to reference coordinates
    const dims = dimsRef.current;
    const refPos = pxToRef({ x: screenX, y: screenY, width: 0, height: 0 }, dims);

    // handle image file drop
    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(f => f.type.startsWith('image/'));
    
    if (imageFile) {
      // validate image type
      if (!isAcceptedImageType(imageFile.type)) {
        showDropError('Please use PNG, JPG, WebP, or GIF images');
        return;
      }
      
      // Create block immediately with loading placeholder for instant feedback
      const blockId = onAddBlock('IMAGE', refPos.x, refPos.y, '__loading__');
      
      // Upload in background, then update the block by ID
      uploadAsset(imageFile).then(result => {
        if (result.success) {
          onUpdateBlock(blockId, { content: result.data.url });
        } else {
          showDropError(result.error);
          onDeleteBlock(blockId);
        }
      });
      return;
    }

    // handle URL drop - pass content directly (no upload needed for external URLs)
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (url && url.startsWith('http')) {
      // check if it's an image URL
      if (isImageUrl(url)) {
        onAddBlock('IMAGE', refPos.x, refPos.y, url);
      } else {
        onAddBlock('LINK', refPos.x, refPos.y, url);
      }
    }
  }, [onAddBlock, onUpdateBlock, onDeleteBlock, showDropError]);

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

  // Get margin overlay color (slightly lighter than background)
  const marginOverlayColor = useMemo(() => getMarginOverlayColor(background), [background]);
  
  // Calculate margin widths in pixels
  const marginWidth = useMemo(() => {
    return SAFE_ZONE_MARGIN * dimensions.scale;
  }, [dimensions.scale]);

  // get block bounds for content sizing
  const blockBounds = useMemo(() => 
    blocks.map(b => ({ x: b.x, y: b.y, width: b.width, height: b.height })),
    [blocks]
  );

  return (
    <div className={styles.canvasWrapper}>
      <CanvasShell
        ref={shellRef}
        mode="editor"
        background={background}
        blockBounds={blockBounds}
        onDimensionsChange={handleDimensionsChange}
        onResizeStart={handleResizeStart}
        onMouseDown={handleCanvasMouseDown}
        onClick={handleCanvasClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={styles.canvas}
        showDebug={false}
      >
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
            onFirstInteraction={onFirstInteraction}
            onBringForward={onBringForward ? () => onBringForward(block.id) : undefined}
            onSendBackward={onSendBackward ? () => onSendBackward(block.id) : undefined}
            onBringToFront={onBringToFront ? () => onBringToFront(block.id) : undefined}
            onSendToBack={onSendToBack ? () => onSendToBack(block.id) : undefined}
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
      </CanvasShell>

      {/* Creation palette - appears at click position (outside shell for fixed positioning) */}
      {palette && (
        <CreationPalette
          x={palette.x}
          y={palette.y}
          onSelect={handlePaletteSelect}
          onClose={handlePaletteClose}
        />
      )}
    </div>
  );
}
