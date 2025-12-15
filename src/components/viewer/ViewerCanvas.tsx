import { useMemo, useRef, useState, useEffect } from 'react';
import type { Block as BlockType, BackgroundConfig } from '@/shared/types';
import { ViewerBlock } from './ViewerBlock';
import { getBackgroundStyles } from '@/shared/utils/blockStyles';
import { 
  useCanvasSize,
  refToPx,
  REFERENCE_HEIGHT,
} from '@/lib/canvas';
import styles from './ViewerCanvas.module.css';

interface ViewerCanvasProps {
  blocks: BlockType[];
  background?: BackgroundConfig;
}

export function ViewerCanvas({ blocks, background }: ViewerCanvasProps) {
  // Use responsive canvas sizing
  const { dimensions, containerRef } = useCanvasSize({ debounceMs: 16 });
  
  // Calculate the minimum height needed based on block positions (in reference coords)
  // then scale to screen pixels
  const maxRefY = useMemo(() => {
    return blocks.reduce((max, b) => Math.max(max, b.y + b.height), 0);
  }, [blocks]);
  
  // Convert max reference Y to screen pixels, with a minimum
  const minHeight = useMemo(() => {
    const scaledMaxY = maxRefY * dimensions.scale;
    return Math.max(scaledMaxY + 100, 400);
  }, [maxRefY, dimensions.scale]);
  
  const { canvasStyle, bgImageStyle } = useMemo(() => getBackgroundStyles(background), [background]);
  const style = useMemo(() => ({ 
    ...canvasStyle, 
    minHeight,
  }), [canvasStyle, minHeight]);

  return (
    <div ref={containerRef} className={styles.canvas} style={style}>
      {bgImageStyle && <div className={styles.bgImageLayer} style={bgImageStyle} />}
      {blocks.map((block) => (
        <ViewerBlock 
          key={block.id} 
          block={block} 
          canvasDimensions={dimensions}
        />
      ))}
    </div>
  );
}
