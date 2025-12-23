import { useMemo, useEffect } from 'react';
import type { Block as BlockType, BackgroundConfig } from '@/shared/types';
import { ViewerBlock } from './ViewerBlock';
import { getBackgroundStyles } from '@/shared/utils/blockStyles';
import { useCanvasSize, REFERENCE_WIDTH, REFERENCE_HEIGHT } from '@/lib/canvas';
import styles from './ViewerCanvas.module.css';

interface ViewerCanvasProps {
  blocks: BlockType[];
  background?: BackgroundConfig;
}

export function ViewerCanvas({ blocks, background }: ViewerCanvasProps) {
  // Use responsive canvas sizing
  const { dimensions, containerRef } = useCanvasSize({ debounceMs: 16 });
  
  // DEBUG: Log canvas dimensions in development (moved out of render)
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[ViewerCanvas] Dimensions:', {
        width: dimensions.width,
        height: dimensions.height,
        scale: dimensions.scale,
        offsetX: dimensions.offsetX,
        blocksCount: blocks.length,
      });
    }
  }, [dimensions, blocks.length]);
  
  const { canvasStyle, bgImageStyle } = useMemo(() => getBackgroundStyles(background), [background]);

  // Calculate content bounds to ensure canvas can scroll to show all blocks
  // Guard against invalid scale/offset values during initial render
  const contentBounds = useMemo(() => {
    // Ensure scale and offset are valid finite numbers
    const safeScale = Number.isFinite(dimensions.scale) && dimensions.scale > 0 
      ? dimensions.scale 
      : 1;
    const safeOffsetX = Number.isFinite(dimensions.offsetX) 
      ? dimensions.offsetX 
      : 0;
    
    if (blocks.length === 0) {
      return { 
        width: REFERENCE_WIDTH * safeScale,
        height: REFERENCE_HEIGHT * safeScale 
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
      width: maxRefX * safeScale + safeOffsetX + 40,
      height: maxRefY * safeScale + 40,
    };
  }, [blocks, dimensions]);

  return (
    <div ref={containerRef} className={styles.canvas} style={canvasStyle}>
      {/* Content sizer - ensures canvas can scroll to show all content */}
      <div 
        className={styles.contentSizer} 
        style={{ 
          minWidth: contentBounds.width, 
          minHeight: contentBounds.height 
        }} 
      />
      
      {bgImageStyle && <div className={styles.bgImageLayer} style={bgImageStyle} />}
      <div className={styles.blocksContainer}>
        {blocks.map((block) => (
          <ViewerBlock 
            key={block.id} 
            block={block} 
            canvasDimensions={dimensions}
          />
        ))}
      </div>
    </div>
  );
}
