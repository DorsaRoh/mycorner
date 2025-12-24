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

/**
 * Normalize asset URLs for public page rendering.
 * - Absolute URLs (http://, https://) and data: URIs are unchanged
 * - Relative URLs starting with / are prefixed with the app origin
 */
function normalizeAssetUrl(url: string): string {
  // Return as-is for absolute URLs and data URIs
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  
  // For relative URLs starting with /, prefix with app origin
  if (url.startsWith('/')) {
    const origin = typeof window !== 'undefined' 
      ? (process.env.NEXT_PUBLIC_APP_ORIGIN || window.location.origin)
      : (process.env.NEXT_PUBLIC_APP_ORIGIN || '');
    return `${origin}${url}`;
  }
  
  // Return as-is for other cases (e.g., blob: URLs)
  return url;
}

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
    const scaled = scaleFontSize(baseFontSize, dims.scale);
    
    // Log fontSize for debugging
    if (process.env.NODE_ENV !== 'production' && (block.type === 'TEXT' || block.type === 'LINK')) {
      console.log('[ViewerBlock] fontSize:', {
        id: block.id,
        type: block.type,
        baseFontSize,
        scale: dims.scale,
        scaledFontSize: scaled,
      });
    }
    
    return scaled;
  }, [block.id, block.type, block.style?.fontSize, dims.scale]);
  
  const blockStyles = useMemo(() => {
    const { outer, inner } = getBlockStyles(block.style, pxRect.width, pxRect.height);
    // For viewer, we merge outer styles (shadow goes on wrapper, border-radius/overflow on content)
    // But for TEXT and LINK blocks, we don't want overflow: hidden as it clips the content
    const isTextOrLink = block.type === 'TEXT' || block.type === 'LINK';
    const mergedStyles = {
      ...outer,
      ...inner,
    };
    if (isTextOrLink) {
      delete mergedStyles.overflow;
    }
    return mergedStyles;
  }, [block.style, block.type, pxRect.width, pxRect.height]);

  // Calculate rotation transform
  const rotationStyle = useMemo(() => {
    if (!block.rotation || block.rotation === 0) return {};
    return {
      transform: `rotate(${block.rotation}deg)`,
      transformOrigin: 'center center',
    };
  }, [block.rotation]);

  return (
    <div
      className={`${styles.block} ${styles[block.type.toLowerCase()]}`}
      style={{
        left: pxRect.x,
        top: pxRect.y,
        width: pxRect.width,
        height: pxRect.height,
        ...blockStyles,
        ...rotationStyle,
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
  // DEBUG: Log renderer branch in development
  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    console.log('[ViewerBlock] Rendering:', { type, contentLength: content?.length, hasEffects: !!effects });
  }
  
  // Get text styles but override fontSize with scaled version (no padding for dynamic sizing)
  const textStyles = useMemo(() => {
    const baseStyles = getTextStyles(style);
    if (scaledFontSize) {
      return {
        ...baseStyles,
        fontSize: `${scaledFontSize}px`,
        padding: '0',
      };
    }
    return { ...baseStyles, padding: '0' };
  }, [style, scaledFontSize]);

  switch (type) {
    case 'TEXT':
      return (
        <div className={styles.textContent} style={textStyles}>
          {content || <span className={styles.empty} />}
        </div>
      );

    case 'IMAGE': {
      if (!content) return null;

      const src = normalizeAssetUrl(content);
      
      // DEBUG: Log image URL normalization in development
      if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
        console.log('[ViewerBlock] IMAGE URL:', { original: content, normalized: src });
      }

      return (
        <EffectsRenderer effects={effects}>
          <div className={styles.imageWrapper}>
            <img src={src} alt="" className={styles.imageContent} draggable={false} />
          </div>
        </EffectsRenderer>
      );
    }

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
