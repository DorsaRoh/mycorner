import { useMemo } from 'react';
import type { Block as BlockType, BlockStyle, BlockEffects } from '@/shared/types';
import { DEFAULT_STYLE } from '@/shared/types';
import { EffectsRenderer } from '@/components/effects';
import styles from './ViewerBlock.module.css';

interface ViewerBlockProps {
  block: BlockType;
}

// Convert BlockStyle to inline CSS styles
function getInlineStyles(style?: BlockStyle, blockWidth?: number, blockHeight?: number): React.CSSProperties {
  if (!style) return {};
  
  const s = { ...DEFAULT_STYLE, ...style };
  const size = Math.min(blockWidth || 200, blockHeight || 200);
  
  // Calculate actual values from normalized 0-1 ranges
  const borderRadiusPx = s.borderRadius * (size / 2);
  const borderWidthPx = s.borderWidth * 12;
  const borderSoftnessPx = s.borderSoftness * 8;
  
  // Shadow calculations
  const shadowBlurPx = s.shadowSoftness * 40;
  const shadowOffsetXPx = s.shadowOffsetX * 30;
  const shadowOffsetYPx = s.shadowOffsetY * 30;
  const shadowOpacity = s.shadowStrength * 0.5;
  
  const result: React.CSSProperties = {
    opacity: s.opacity,
  };
  
  if (s.borderRadius > 0) {
    result.borderRadius = `${borderRadiusPx}px`;
  }
  
  if (s.borderWidth > 0) {
    result.outline = `${borderWidthPx}px solid ${s.borderColor}`;
    result.outlineOffset = `-${borderWidthPx / 2}px`;
    
    if (s.borderSoftness > 0) {
      const softEdge = `0 0 ${borderSoftnessPx}px ${borderSoftnessPx / 2}px ${s.borderColor}`;
      if (s.shadowStrength > 0) {
        result.boxShadow = `${softEdge}, ${shadowOffsetXPx}px ${shadowOffsetYPx}px ${shadowBlurPx}px rgba(0, 0, 0, ${shadowOpacity})`;
      } else {
        result.boxShadow = softEdge;
      }
    } else if (s.shadowStrength > 0) {
      result.boxShadow = `${shadowOffsetXPx}px ${shadowOffsetYPx}px ${shadowBlurPx}px rgba(0, 0, 0, ${shadowOpacity})`;
    }
  } else {
    if (s.borderSoftness > 0) {
      const softEdge = `0 0 ${borderSoftnessPx}px ${borderSoftnessPx / 2}px ${s.borderColor}`;
      if (s.shadowStrength > 0) {
        result.boxShadow = `${softEdge}, ${shadowOffsetXPx}px ${shadowOffsetYPx}px ${shadowBlurPx}px rgba(0, 0, 0, ${shadowOpacity})`;
      } else {
        result.boxShadow = softEdge;
      }
    } else if (s.shadowStrength > 0) {
      result.boxShadow = `${shadowOffsetXPx}px ${shadowOffsetYPx}px ${shadowBlurPx}px rgba(0, 0, 0, ${shadowOpacity})`;
    }
  }
  
  return result;
}

export function ViewerBlock({ block }: ViewerBlockProps) {
  const inlineStyles = useMemo(() => {
    return getInlineStyles(block.style, block.width, block.height);
  }, [block.style, block.width, block.height]);
  
  return (
    <div
      className={`${styles.block} ${styles[block.type.toLowerCase()]}`}
      style={{
        left: block.x,
        top: block.y,
        width: block.width,
        height: block.height,
        ...inlineStyles,
      }}
    >
      <BlockContent type={block.type} content={block.content} style={block.style} effects={block.effects} />
    </div>
  );
}

interface BlockContentProps {
  type: BlockType['type'];
  content: string;
  style?: BlockStyle;
  effects?: BlockEffects;
}

function BlockContent({ type, content, effects }: BlockContentProps) {
  switch (type) {
    case 'TEXT':
      return (
        <div className={styles.textContent}>
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
    
    case 'LINK':
      if (!content) return null;
      
      // Parse link content - supports both JSON format and simple URLs
      let linkName = '';
      let linkUrl = '';
      
      try {
        const parsed = JSON.parse(content);
        if (parsed.url) {
          linkName = parsed.name || '';
          linkUrl = parsed.url;
        }
      } catch {
        // Not JSON, treat as simple URL
        linkUrl = content;
      }
      
      // Get display name
      if (!linkName && linkUrl) {
        try {
          const url = new URL(linkUrl);
          linkName = url.hostname.replace('www.', '');
        } catch {
          linkName = linkUrl;
        }
      }
      
      if (!linkUrl) return null;
      
      return (
        <a 
          href={linkUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className={styles.linkContent}
        >
          <span className={styles.linkIcon}>↗</span>
          <span className={styles.linkHost}>{linkName}</span>
        </a>
      );
    
    default:
      return null;
  }
}

