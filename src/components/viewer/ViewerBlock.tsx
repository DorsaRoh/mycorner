import { useMemo, memo } from 'react';
import type { Block as BlockType, BlockStyle, BlockEffects } from '@/shared/types';
import { DEFAULT_STYLE } from '@/shared/types';
import { getBlockStyles, getTextStyles, parseLinkContent } from '@/shared/utils/blockStyles';
import { 
  CanvasDimensions, 
  refToPx, 
  scaleFontSize,
  REFERENCE_WIDTH,
  REFERENCE_HEIGHT,
} from '@/lib/canvas';
import { EffectsRenderer } from '@/components/effects/EffectsRenderer';
import styles from './ViewerBlock.module.css';

interface ViewerBlockProps {
  block: BlockType;
  canvasDimensions?: CanvasDimensions;
}

// Memoized ViewerBlock - only rerenders when block changes
export const ViewerBlock = memo(function ViewerBlock({ block, canvasDimensions }: ViewerBlockProps) {
  // Default dimensions if not provided (uses reference size, scale = 1, no offset)
  const dims = canvasDimensions || {
    width: REFERENCE_WIDTH,
    height: REFERENCE_HEIGHT,
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: 0,
  };
  
  // Convert reference coordinates to pixels
  const pxRect = useMemo(() => refToPx(
    { x: block.x, y: block.y, width: block.width, height: block.height },
    dims
  ), [block.x, block.y, block.width, block.height, dims]);
  
  // Scale font size for rendering
  const scaledFontSize = useMemo(() => {
    const baseFontSize = block.style?.fontSize || DEFAULT_STYLE.fontSize || 16;
    return scaleFontSize(baseFontSize, dims.scale);
  }, [block.style?.fontSize, dims.scale]);
  
  const blockStyles = useMemo(() => {
    const { outer, inner } = getBlockStyles(block.style, pxRect.width, pxRect.height);
    // For viewer, we merge outer styles (shadow goes on wrapper, border-radius/overflow on content)
    return {
      ...outer,
      ...inner,
    };
  }, [block.style, pxRect.width, pxRect.height]);

  return (
    <div
      className={`${styles.block} ${styles[block.type.toLowerCase()]}`}
      style={{
        left: pxRect.x,
        top: pxRect.y,
        width: pxRect.width,
        height: pxRect.height,
        ...blockStyles,
      }}
    >
      <BlockContent 
        type={block.type} 
        content={block.content} 
        style={block.style} 
        effects={block.effects}
        scaledFontSize={scaledFontSize}
      />
    </div>
  );
});

interface BlockContentProps {
  type: BlockType['type'];
  content: string;
  style?: BlockStyle;
  effects?: BlockEffects;
  scaledFontSize?: number;
}

const BlockContent = memo(function BlockContent({ type, content, style, effects, scaledFontSize }: BlockContentProps) {
  // Get text styles but override fontSize with scaled version
  const textStyles = useMemo(() => {
    const baseStyles = getTextStyles(style);
    if (scaledFontSize) {
      return {
        ...baseStyles,
        fontSize: `${scaledFontSize}px`,
        padding: `${Math.round(scaledFontSize * 0.1)}px ${Math.round(scaledFontSize * 0.15)}px`,
      };
    }
    return baseStyles;
  }, [style, scaledFontSize]);

  switch (type) {
    case 'TEXT':
      return (
        <div className={styles.textContent} style={textStyles}>
          {content || <span className={styles.empty} />}
        </div>
      );

    case 'IMAGE':
      if (!content) return null;

      return (
        <EffectsRenderer effects={effects}>
          <div className={styles.imageWrapper}>
            <img src={content} alt="" className={styles.imageContent} draggable={false} />
          </div>
        </EffectsRenderer>
      );

    case 'LINK': {
      if (!content) return null;

      const { name, url } = parseLinkContent(content);
      const displayName = name || url;

      if (!url) return null;

      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.linkContent}
          style={textStyles}
        >
          <span className={styles.linkText}>{displayName}</span>
          <span className={styles.linkIcon}>↗</span>
        </a>
      );
    }

    default:
      return null;
  }
});
