import { useMemo } from 'react';
import type { Block as BlockType, BackgroundConfig } from '@/shared/types';
import { ViewerBlock } from './ViewerBlock';
import { getBackgroundStyles } from '@/shared/utils/blockStyles';
import styles from './ViewerCanvas.module.css';

interface ViewerCanvasProps {
  blocks: BlockType[];
  background?: BackgroundConfig;
}

export function ViewerCanvas({ blocks, background }: ViewerCanvasProps) {
  const maxY = blocks.reduce((max, b) => Math.max(max, b.y + b.height), 0);
  const { canvasStyle, bgImageStyle } = useMemo(() => getBackgroundStyles(background), [background]);
  const style = useMemo(() => ({ ...canvasStyle, minHeight: Math.max(maxY + 100, 400) }), [canvasStyle, maxY]);

  return (
    <div className={styles.canvas} style={style}>
      {bgImageStyle && <div className={styles.bgImageLayer} style={bgImageStyle} />}
      {blocks.map((block) => <ViewerBlock key={block.id} block={block} />)}
    </div>
  );
}
