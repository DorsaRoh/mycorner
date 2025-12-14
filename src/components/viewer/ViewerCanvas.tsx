import type { Block as BlockType } from '@/shared/types';
import { ViewerBlock } from './ViewerBlock';
import styles from './ViewerCanvas.module.css';

interface ViewerCanvasProps {
  blocks: BlockType[];
}

export function ViewerCanvas({ blocks }: ViewerCanvasProps) {
  // Calculate canvas bounds from block positions
  const bounds = blocks.reduce(
    (acc, block) => ({
      maxX: Math.max(acc.maxX, block.x + block.width),
      maxY: Math.max(acc.maxY, block.y + block.height),
    }),
    { maxX: 0, maxY: 0 }
  );

  return (
    <div 
      className={styles.canvas}
      style={{
        minHeight: Math.max(bounds.maxY + 100, 400),
      }}
    >
      {blocks.map((block) => (
        <ViewerBlock key={block.id} block={block} />
      ))}
    </div>
  );
}

