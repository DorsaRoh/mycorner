import { useMemo } from 'react';
import type { Block as BlockType, BackgroundConfig } from '@/shared/types';
import { ViewerBlock } from './ViewerBlock';
import styles from './ViewerCanvas.module.css';

interface ViewerCanvasProps {
  blocks: BlockType[];
  background?: BackgroundConfig;
}

export function ViewerCanvas({ blocks, background }: ViewerCanvasProps) {
  // Calculate canvas bounds from block positions
  const bounds = blocks.reduce(
    (acc, block) => ({
      maxX: Math.max(acc.maxX, block.x + block.width),
      maxY: Math.max(acc.maxY, block.y + block.height),
    }),
    { maxX: 0, maxY: 0 }
  );

  // Compute canvas background styles from config
  const canvasStyle = useMemo(() => {
    const style: React.CSSProperties = {
      minHeight: Math.max(bounds.maxY + 100, 400),
    };
    
    if (!background) return style;

    if (background.mode === 'solid' && background.solid) {
      style.background = background.solid.color;
    } else if (background.mode === 'gradient' && background.gradient) {
      const { type, colorA, colorB, angle } = background.gradient;
      if (type === 'radial') {
        style.background = `radial-gradient(circle, ${colorA} 0%, ${colorB} 100%)`;
      } else {
        style.background = `linear-gradient(${angle}deg, ${colorA} 0%, ${colorB} 100%)`;
      }
    }

    return style;
  }, [background, bounds.maxY]);

  return (
    <div
      className={styles.canvas}
      style={canvasStyle}
    >
      {blocks.map((block) => (
        <ViewerBlock key={block.id} block={block} />
      ))}
    </div>
  );
}

