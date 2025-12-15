import { useMemo } from 'react';
import type { Block as BlockType, BackgroundConfig } from '@/shared/types';
import { ViewerBlock } from './ViewerBlock';
import { getBackgroundStyles } from '@/shared/utils/blockStyles';
import { useCanvasSize } from '@/lib/canvas';
import styles from './ViewerCanvas.module.css';

interface ViewerCanvasProps {
  blocks: BlockType[];
  background?: BackgroundConfig;
}

export function ViewerCanvas({ blocks, background }: ViewerCanvasProps) {
  // Use responsive canvas sizing
  const { dimensions, containerRef } = useCanvasSize({ debounceMs: 16 });
  
  const { canvasStyle, bgImageStyle } = useMemo(() => getBackgroundStyles(background), [background]);

  return (
    <div ref={containerRef} className={styles.canvas} style={canvasStyle}>
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
