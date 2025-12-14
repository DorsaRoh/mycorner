import { useState, useCallback, useRef, useEffect } from 'react';
import type { Block as BlockType, BlockType as BlockTypeEnum, BackgroundConfig } from '@/shared/types';
import { Block } from './Block';
import { CreationPalette } from './CreationPalette';
import { BackgroundLayer } from '../BackgroundLayer';
import { uploadAsset, isAcceptedImageType } from '@/lib/upload';
import { isImageUrl } from '@/shared/utils/blockStyles';
import styles from './Canvas.module.css';

interface PaletteState {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
}

interface MarqueeState {
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
  onSelectBlock: (id: string | null) => void;
  onSelectMultiple: (ids: Set<string>) => void;
  onUpdateBlock: (id: string, updates: Partial<BlockType>) => void;
  onUpdateMultipleBlocks: (ids: Set<string>, updates: Partial<BlockType>) => void;
  onDeleteBlock: (id: string) => void;
  onAddBlock: (type: BlockType['type'], x: number, y: number, content?: string) => void;
  onSetEditing?: (id: string | null) => void;
}

export function Canvas({
  blocks,
  background,
  selectedId,
  selectedIds,
  newBlockIds = new Set(),
  editingId = null,
  onSelectBlock,
  onSelectMultiple,
  onUpdateBlock,
  onDeleteBlock,
  onAddBlock,
  onUpdateMultipleBlocks,
  onSetEditing,
}: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [palette, setPalette] = useState<PaletteState | null>(null);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const isMarqueeActive = useRef(false);

  // Clear drop error after a delay
  const showDropError = useCallback((message: string) => {
    setDropError(message);
    setTimeout(() => setDropError(null), 3000);
  }, []);

  // Handle mousedown for marquee selection
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // Only trigger on canvas or paper sheet (empty areas)
    if (target !== canvasRef.current && !target.classList.contains(styles.paperSheet)) {
      return;
    }
    
    // Close palette if open
    if (palette) {
      setPalette(null);
    }
    
    // Deselect all
    onSelectBlock(null);
    onSelectMultiple(new Set());
    
    // Start potential marquee selection
    const rect = canvasRef.current!.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    
    isMarqueeActive.current = true;
    setMarquee({
      startX: canvasX,
      startY: canvasY,
      currentX: canvasX,
      currentY: canvasY,
    });
  }, [palette, onSelectBlock, onSelectMultiple]);

  // Handle click on empty canvas - show creation palette
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // Only trigger on canvas or paper sheet (empty areas)
    if (target !== canvasRef.current && !target.classList.contains(styles.paperSheet)) {
      return;
    }
    
    // If we did a marquee selection, don't show palette
    if (marquee && (
      Math.abs(marquee.currentX - marquee.startX) > 5 ||
      Math.abs(marquee.currentY - marquee.startY) > 5
    )) {
      return;
    }
    
    // Calculate positions for palette (screen coords for fixed positioning)
    // and canvas coords for block placement
    const rect = canvasRef.current!.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    
    // Show palette at new location (or relocate if already open)
    setPalette({
      x: e.clientX,
      y: e.clientY,
      canvasX,
      canvasY,
    });
  }, [marquee]);
  
  // Handle marquee mouse move and up
  useEffect(() => {
    if (!marquee) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isMarqueeActive.current || !canvasRef.current) return;
      
      const rect = canvasRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      
      setMarquee(prev => prev ? {
        ...prev,
        currentX,
        currentY,
      } : null);
      
      // Calculate which blocks are inside marquee
      const minX = Math.min(marquee.startX, currentX);
      const maxX = Math.max(marquee.startX, currentX);
      const minY = Math.min(marquee.startY, currentY);
      const maxY = Math.max(marquee.startY, currentY);
      
      const selectedBlocks = new Set<string>();
      blocks.forEach(block => {
        // Check if block overlaps with marquee
        const blockRight = block.x + block.width;
        const blockBottom = block.y + block.height;
        
        if (block.x < maxX && blockRight > minX && block.y < maxY && blockBottom > minY) {
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

  // Handle palette selection
  const handlePaletteSelect = useCallback((type: BlockTypeEnum, content?: string) => {
    if (palette) {
      onAddBlock(type, palette.canvasX, palette.canvasY, content);
      setPalette(null);
    }
  }, [palette, onAddBlock]);

  // Close palette
  const handlePaletteClose = useCallback(() => {
    setPalette(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

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
        onAddBlock('IMAGE', x, y, result.data.url);
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
        onAddBlock('IMAGE', x, y, url);
      } else {
        onAddBlock('LINK', x, y, url);
      }
    }
  }, [onAddBlock, showDropError]);

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

  return (
    <div
      ref={canvasRef}
      className={styles.canvas}
      onMouseDown={handleCanvasMouseDown}
      onClick={handleCanvasClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Background layer */}
      <BackgroundLayer config={background} />

      {/* Subtle paper boundary */}
      <div className={styles.paperSheet} />

      {blocks.map((block) => (
        <Block
          key={block.id}
          block={block}
          selected={selectedId === block.id}
          multiSelected={selectedIds.has(block.id) && selectedId !== block.id}
          isNew={newBlockIds.has(block.id)}
          isEditing={editingId === block.id}
          onSelect={() => onSelectBlock(block.id)}
          onUpdate={(updates) => onUpdateBlock(block.id, updates)}
          onUpdateMultiple={onUpdateMultipleBlocks}
          selectedIds={selectedIds}
          onDelete={() => onDeleteBlock(block.id)}
          onSetEditing={(editing) => onSetEditing?.(editing ? block.id : null)}
        />
      ))}
      
      {blocks.length === 0 && (
        <div className={styles.emptyState}>
          <p className={styles.emptySubtext}>click anywhere</p>
        </div>
      )}
      
      {/* Marquee selection box */}
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
    </div>
  );
}
