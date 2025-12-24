/**
 * PublicPageView - React component for rendering published pages.
 * 
 * This component is used by the /[slug] SSR route to render pages
 * consistently with the editor preview. It uses the same ViewerCanvas
 * and ViewerBlock components as the editor's preview mode.
 * 
 * WHY SSR: We use getServerSideProps instead of static generation to:
 * 1. Avoid "Loading..." fallback issues with getStaticPaths
 * 2. Ensure the page always renders immediately on first load
 * 3. Keep DB as the source of truth (not R2 HTML cache)
 * 4. Match the editor's rendering exactly using React components
 */

import Head from 'next/head';
import Link from 'next/link';
import type { PageDoc, Block as PageDocBlock } from '@/lib/schema/page';
import type { Block as LegacyBlock } from '@/shared/types';
import type { BackgroundConfig } from '@/shared/types';
import { ViewerCanvas } from './ViewerCanvas';
import { getTheme, getThemeBackground } from '@/lib/themes';
import { getUiTokenStyles, getUiMode } from '@/lib/platformUi';
import styles from './PublicPageView.module.css';

// =============================================================================
// Props
// =============================================================================

interface PublicPageViewProps {
  doc: PageDoc;
  slug: string;
}

// =============================================================================
// PageDoc to Legacy Block Conversion
// =============================================================================

/**
 * Convert PageDoc blocks to legacy Block format used by ViewerCanvas.
 * The editor and viewer use the legacy format internally.
 */
function convertToLegacyBlocks(pageDocBlocks: PageDocBlock[]): LegacyBlock[] {
  if (!Array.isArray(pageDocBlocks)) {
    console.error('[convertToLegacyBlocks] Input is not an array:', typeof pageDocBlocks, pageDocBlocks);
    return [];
  }
  
  return pageDocBlocks.map((block, index): LegacyBlock => {
    // Validate block structure
    if (!block || typeof block !== 'object') {
      console.error(`[convertToLegacyBlocks] Invalid block at index ${index}:`, block);
      return { id: `invalid_${index}`, type: 'TEXT', x: 0, y: 0, width: 100, height: 50, content: '' };
    }
    
    if (!block.type) {
      console.error(`[convertToLegacyBlocks] Block ${index} missing type:`, block);
    }
    const base = {
      id: block.id,
      x: block.x,
      y: block.y,
      width: block.width,
      height: block.height,
      rotation: block.rotation,
      style: block.style ? convertStyle(block.style) : undefined,
    };

    switch (block.type) {
      case 'text':
        return {
          ...base,
          type: 'TEXT',
          content: block.content.text,
        };
      case 'image':
        return {
          ...base,
          type: 'IMAGE',
          content: block.content.url,
        };
      case 'link':
        // Legacy format stores links as JSON string with {name, url}
        return {
          ...base,
          type: 'LINK',
          content: JSON.stringify({
            name: block.content.label,
            url: block.content.url,
          }),
        };
      default:
        // Fallback for unknown types
        return {
          ...base,
          type: 'TEXT',
          content: '',
        };
    }
  });
}

/**
 * Convert PageDoc style to legacy BlockStyle format.
 * CRITICAL: Preserves ALL text styling properties for deterministic rendering.
 */
function convertStyle(style: NonNullable<PageDocBlock['style']>): LegacyBlock['style'] {
  // Map radius enum to number (0-1)
  const radiusMap: Record<string, number> = {
    none: 0,
    sm: 0.15,
    md: 0.3,
    lg: 0.5,
    full: 1,
  };

  // Map shadow enum to strength (0-1)
  const shadowMap: Record<string, number> = {
    none: 0,
    sm: 0.2,
    md: 0.4,
    lg: 0.6,
  };

  const result: LegacyBlock['style'] = {
    // Use exact value if available, otherwise map from enum
    borderRadius: typeof style.borderRadiusValue === 'number' 
      ? style.borderRadiusValue 
      : (radiusMap[style.radius || 'none'] || 0),
    shadowStrength: typeof style.shadowStrengthValue === 'number'
      ? style.shadowStrengthValue
      : (shadowMap[style.shadow || 'none'] || 0),
    shadowSoftness: typeof style.shadowSoftness === 'number' ? style.shadowSoftness : 0.5,
    shadowOffsetX: typeof style.shadowOffsetX === 'number' ? style.shadowOffsetX : 0,
    shadowOffsetY: typeof style.shadowOffsetY === 'number' ? style.shadowOffsetY : 0.2,
    textAlign: style.align || 'left',
  };

  // === RESTORE TEXT STYLING (critical for production) ===
  if (style.fontFamily) {
    result.fontFamily = style.fontFamily;
  }
  if (typeof style.fontSize === 'number') {
    result.fontSize = style.fontSize;
  }
  if (typeof style.fontWeight === 'number') {
    result.fontWeight = style.fontWeight;
  }
  if (style.fontStyle) {
    result.fontStyle = style.fontStyle;
  }
  if (style.color) {
    result.color = style.color;
  }
  if (typeof style.textOpacity === 'number') {
    result.textOpacity = style.textOpacity;
  }
  if (typeof style.lineHeight === 'number') {
    result.lineHeight = style.lineHeight;
  }
  if (style.textDecoration) {
    result.textDecoration = style.textDecoration;
  }

  return result;
}

// =============================================================================
// Component
// =============================================================================

export function PublicPageView({ doc, slug }: PublicPageViewProps) {
  const theme = getTheme(doc.themeId);
  const title = doc.title || 'My Corner';
  const description = doc.bio || `${title} - A corner of the web`;
  
  // Convert PageDoc blocks to legacy format for ViewerCanvas
  const legacyBlocks = convertToLegacyBlocks(doc.blocks);
  
  // Get background config for platform UI tokens
  const background = doc.background as BackgroundConfig | undefined;
  
  // Compute platform UI tokens based on background
  const uiTokenStyles = getUiTokenStyles(background);
  const uiMode = getUiMode(background);
  
  // DEBUG: Always log on first render to diagnose blank page issues
  if (typeof window !== 'undefined') {
    console.log('[PublicPageView] === RENDER DEBUG ===');
    console.log('[PublicPageView] Slug:', slug);
    console.log('[PublicPageView] PageDoc blocks count:', doc.blocks.length);
    console.log('[PublicPageView] PageDoc block types:', doc.blocks.map(b => b.type));
    console.log('[PublicPageView] Legacy blocks count:', legacyBlocks.length);
    console.log('[PublicPageView] Legacy blocks:', legacyBlocks.map(b => ({
      id: b.id,
      type: b.type,
      contentLength: b.content?.length,
      x: b.x,
      y: b.y,
      w: b.width,
      h: b.height,
    })));
    console.log('[PublicPageView] Theme:', doc.themeId);
    console.log('[PublicPageView] Background:', doc.background);
    console.log('[PublicPageView] UI Mode:', uiMode);
  }
  
  // get background style from theme
  const backgroundStyle = getThemeBackground(theme);
  
  // apply theme css variables - cast to CSSProperties for safe inline usage
  // this ensures all theme vars are present for child components
  const themeVars = theme.variables as unknown as React.CSSProperties;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        
        {/* Open Graph */}
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://www.itsmycorner.com/${slug}`} />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
      </Head>
      
      <div 
        className={`public-page-container ${styles.container}`}
        style={{
          ...themeVars,
          ...backgroundStyle,
          ...uiTokenStyles,
          // map theme vars to global css var names used by ViewerBlock styles
          '--color-bg-pure': theme.variables['--bg-primary'],
          '--color-text': theme.variables['--text-primary'],
          '--font-sans': 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          // ensure container fills viewport
          position: 'relative',
          minHeight: '100vh',
          width: '100%',
        } as React.CSSProperties}
      >
        {/* DEBUG: Show page info (visible in dev, hidden in prod) */}
        {process.env.NODE_ENV !== 'production' && (
          <div style={{
            position: 'fixed',
            bottom: '60px',
            left: '8px',
            padding: '8px 12px',
            background: 'rgba(0,0,0,0.8)',
            color: '#0f0',
            fontFamily: 'monospace',
            fontSize: '10px',
            borderRadius: '4px',
            zIndex: 9999,
            maxWidth: '300px',
            wordBreak: 'break-all',
          }}>
            <div>Slug: {slug}</div>
            <div>PageDoc blocks: {doc.blocks.length}</div>
            <div>Block types: {doc.blocks.map(b => b.type).join(', ')}</div>
            <div>Legacy blocks: {legacyBlocks.length}</div>
            <div>Theme: {doc.themeId}</div>
          </div>
        )}
        
        {/* Show warning if no blocks */}
        {legacyBlocks.length === 0 && (
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: '#999',
            fontFamily: 'system-ui, sans-serif',
            zIndex: 9998,
          }}>
            <p style={{ fontSize: '18px', marginBottom: '8px' }}>No content found</p>
            <p style={{ fontSize: '12px', color: '#ccc' }}>
              PageDoc blocks: {doc.blocks.length} | Legacy blocks: {legacyBlocks.length}
            </p>
            <p style={{ fontSize: '10px', color: '#aaa', marginTop: '12px' }}>
              Check the console for more details.
            </p>
          </div>
        )}
        
        <ViewerCanvas 
          blocks={legacyBlocks}
          background={background}
        />
        
        {/* CTA button - "Make your own" - uses platform UI tokens for auto-contrast */}
        <Link href="/new" className={styles.ctaButton}>
          Make your own
        </Link>
      </div>
    </>
  );
}

