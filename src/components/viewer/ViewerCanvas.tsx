/**
 * ViewerCanvas - Public page canvas renderer.
 * 
 * Uses shared CanvasShell for consistent sizing and layering
 * with the editor, ensuring published pages look identical
 * to the editor preview.
 */

import { useMemo, useEffect, useState, useCallback } from 'react';
import type { Block as BlockType, BackgroundConfig } from '@/shared/types';
import { ViewerBlock } from './ViewerBlock';
import { CanvasShell } from '@/components/canvas';
import { 
  CanvasDimensions,
  REFERENCE_WIDTH, 
  REFERENCE_HEIGHT 
} from '@/lib/canvas';

interface ViewerCanvasProps {
  blocks: BlockType[];
  background?: BackgroundConfig;
}

// Default dimensions for initial render (before measurement)
const DEFAULT_DIMENSIONS: CanvasDimensions = {
  width: REFERENCE_WIDTH,
  height: REFERENCE_HEIGHT,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
};

export function ViewerCanvas({ blocks, background }: ViewerCanvasProps) {
  // Track dimensions in state so blocks re-render when they change
  const [dimensions, setDimensions] = useState<CanvasDimensions>(DEFAULT_DIMENSIONS);
  
  // Handle dimension changes from shell
  const handleDimensionsChange = useCallback((dims: CanvasDimensions) => {
    setDimensions(dims);
  }, []);
  
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
  
  // Get block bounds for content sizing
  const blockBounds = useMemo(() => 
    blocks.map(b => ({ x: b.x, y: b.y, width: b.width, height: b.height })),
    [blocks]
  );

  return (
    <CanvasShell
      mode="viewer"
      background={background}
      blockBounds={blockBounds}
      onDimensionsChange={handleDimensionsChange}
      showDebug={false}
    >
      {blocks.map((block) => (
        <ViewerBlock 
          key={block.id} 
          block={block} 
          canvasDimensions={dimensions}
        />
      ))}
    </CanvasShell>
  );
}
