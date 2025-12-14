import { useMemo, memo } from 'react';
import type { Block as BlockType, BlockStyle, BlockEffects } from '@/shared/types';
import { getBlockStyles, getTextStyles, parseLinkContent } from '@/shared/utils/blockStyles';
import { EffectsRenderer } from '@/components/effects/EffectsRenderer';
import styles from './ViewerBlock.module.css';

interface ViewerBlockProps {
  block: BlockType;
}

// Memoized ViewerBlock - only rerenders when block changes
export const ViewerBlock = memo(function ViewerBlock({ block }: ViewerBlockProps) {
  const blockStyles = useMemo(() => {
    const { outer, inner } = getBlockStyles(block.style, block.width, block.height);
    // For viewer, we merge outer styles (shadow goes on wrapper, border-radius/overflow on content)
    return {
      ...outer,
      ...inner,
    };
  }, [block.style, block.width, block.height]);

  return (
    <div
      className={`${styles.block} ${styles[block.type.toLowerCase()]}`}
      style={{
        left: block.x,
        top: block.y,
        width: block.width,
        height: block.height,
        ...blockStyles,
      }}
    >
      <BlockContent type={block.type} content={block.content} style={block.style} effects={block.effects} />
    </div>
  );
});

interface BlockContentProps {
  type: BlockType['type'];
  content: string;
  style?: BlockStyle;
  effects?: BlockEffects;
}

const BlockContent = memo(function BlockContent({ type, content, style, effects }: BlockContentProps) {
  const textStyles = useMemo(() => getTextStyles(style), [style]);

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
