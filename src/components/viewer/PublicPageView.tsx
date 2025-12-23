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
import { ViewerCanvas } from './ViewerCanvas';
import { getTheme, getThemeBackground } from '@/lib/themes';

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
  return pageDocBlocks.map((block): LegacyBlock => {
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

  return {
    borderRadius: radiusMap[style.radius || 'none'] || 0,
    shadowStrength: shadowMap[style.shadow || 'none'] || 0,
    shadowSoftness: 0.5,
    shadowOffsetX: 0,
    shadowOffsetY: 0.2,
    textAlign: style.align || 'left',
  };
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
  
  // Get background style from theme
  const backgroundStyle = getThemeBackground(theme);
  
  // Apply theme CSS variables
  const themeVars = Object.entries(theme.variables).reduce((acc, [key, value]) => {
    acc[key as keyof React.CSSProperties] = value;
    return acc;
  }, {} as Record<string, string>);

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
        className="public-page-container"
        style={{
          ...themeVars,
          ...backgroundStyle,
          minHeight: '100vh',
          '--color-bg-pure': theme.variables['--bg-primary'],
          '--color-text': theme.variables['--text-primary'],
          '--font-sans': 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        } as React.CSSProperties}
      >
        <ViewerCanvas 
          blocks={legacyBlocks}
        />
        
        {/* CTA button - "Make your own" */}
        <Link 
          href="/new"
          style={{
            position: 'fixed',
            top: '16px',
            right: '16px',
            zIndex: 100,
            padding: '8px 14px',
            background: theme.variables['--accent-primary'],
            color: 'white',
            textDecoration: 'none',
            fontSize: '13px',
            fontWeight: 500,
            borderRadius: '6px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          Make your own
        </Link>
      </div>
    </>
  );
}

