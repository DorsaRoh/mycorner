import type { Block as BlockType, BackgroundConfig } from '@/shared/types';
import { ViewerBlock } from './ViewerBlock';
import { BackgroundLayer } from '../BackgroundLayer';
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

  return (
    <div
      className={styles.canvas}
      style={{
        minHeight: Math.max(bounds.maxY + 100, 400),
      }}
    >
      {/* Background layer */}
      <BackgroundLayer config={background} />

      {blocks.map((block) => (
        <ViewerBlock key={block.id} block={block} />
      ))}
    </div>
  );
}

