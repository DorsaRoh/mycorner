/**
 * Static HTML renderer for published pages.
 * 
 * Renders a validated PageDoc into a complete HTML string that can be
 * stored in object storage and served statically.
 * 
 * Security:
 * - Escapes all user text for HTML
 * - Validates/normalizes link URLs (http/https only)
 * - Image URLs must be from allowed domains
 * - Includes Content Security Policy
 */

import type { PageDoc, Block, TextBlock, LinkBlock, ImageBlock, BlockStyle } from '../../lib/schema/page';
import { getTheme, type Theme } from '../../lib/themes';

// =============================================================================
// Configuration
// =============================================================================

const APP_NAME = 'YourCorner';
const APP_ORIGIN = process.env.APP_ORIGIN || process.env.PUBLIC_URL || 'https://yourcorner.com';
const STORAGE_DOMAIN = process.env.S3_PUBLIC_BASE_URL 
  ? new URL(process.env.S3_PUBLIC_BASE_URL).host 
  : '';

// Allowed image domains
const ALLOWED_IMAGE_DOMAINS = new Set([
  STORAGE_DOMAIN,
  // Add other allowed domains here
].filter(Boolean));

// =============================================================================
// HTML Escaping
// =============================================================================

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
};

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, char => HTML_ESCAPE_MAP[char] || char);
}

/**
 * Escape a URL for use in HTML attributes.
 * Only escapes characters that are problematic in attribute values.
 */
function escapeUrl(url: string): string {
  return url
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

// =============================================================================
// URL Validation
// =============================================================================

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isAllowedImageUrl(url: string): boolean {
  // Allow relative URLs (our own assets)
  if (url.startsWith('/')) return true;
  
  try {
    const parsed = new URL(url);
    // Must be http/https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    // If we have allowed domains, check against them
    if (ALLOWED_IMAGE_DOMAINS.size > 0) {
      return ALLOWED_IMAGE_DOMAINS.has(parsed.host);
    }
    // If no domains configured, allow all https
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// =============================================================================
// Style Rendering
// =============================================================================

function getBlockStyles(block: Block): string {
  const styles: string[] = [
    `position: absolute`,
    `left: ${block.x}px`,
    `top: ${block.y}px`,
    `width: ${block.width}px`,
    `height: ${block.height}px`,
  ];
  
  if (block.rotation) {
    styles.push(`transform: rotate(${block.rotation}deg)`);
  }
  
  const style = block.style || {};
  
  // Border radius
  const radiusMap: Record<string, string> = {
    none: '0',
    sm: '4px',
    md: '8px',
    lg: '16px',
    full: '9999px',
  };
  if (style.radius) {
    styles.push(`border-radius: ${radiusMap[style.radius] || '0'}`);
  }
  
  // Shadow
  const shadowMap: Record<string, string> = {
    none: 'none',
    sm: '0 1px 2px rgba(0,0,0,0.1)',
    md: '0 4px 6px rgba(0,0,0,0.1)',
    lg: '0 10px 15px rgba(0,0,0,0.1)',
  };
  if (style.shadow) {
    styles.push(`box-shadow: ${shadowMap[style.shadow] || 'none'}`);
  }
  
  // Text alignment
  if (style.align) {
    styles.push(`text-align: ${style.align}`);
  }
  
  // Card mode
  if (style.card) {
    styles.push(`background: var(--card-bg)`);
    styles.push(`border: 1px solid var(--card-border)`);
    styles.push(`padding: 16px`);
  }
  
  return styles.join('; ');
}

// =============================================================================
// Block Rendering
// =============================================================================

function renderTextBlock(block: TextBlock): string {
  const text = escapeHtml(block.content.text);
  const style = getBlockStyles(block);
  
  return `<div class="block block-text" style="${style}">
    <p>${text.replace(/\n/g, '<br>')}</p>
  </div>`;
}

function renderLinkBlock(block: LinkBlock): string {
  const label = escapeHtml(block.content.label);
  const url = block.content.url;
  
  // Validate URL
  if (!isValidUrl(url)) {
    return `<div class="block block-link block-invalid" style="${getBlockStyles(block)}">
      <span class="link-label">${label}</span>
    </div>`;
  }
  
  const safeUrl = escapeUrl(url);
  const style = getBlockStyles(block);
  
  return `<div class="block block-link" style="${style}">
    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="link-button">
      ${label}
    </a>
  </div>`;
}

function renderImageBlock(block: ImageBlock): string {
  const url = block.content.url;
  const alt = escapeHtml(block.content.alt || '');
  
  // Validate image URL
  if (!isAllowedImageUrl(url)) {
    return `<div class="block block-image block-invalid" style="${getBlockStyles(block)}">
      <div class="image-placeholder">Image unavailable</div>
    </div>`;
  }
  
  const safeUrl = escapeUrl(url);
  const style = getBlockStyles(block);
  
  return `<div class="block block-image" style="${style}">
    <img src="${safeUrl}" alt="${alt}" loading="lazy" />
  </div>`;
}

function renderBlock(block: Block): string {
  switch (block.type) {
    case 'text':
      return renderTextBlock(block);
    case 'link':
      return renderLinkBlock(block);
    case 'image':
      return renderImageBlock(block);
    default:
      return '';
  }
}

// =============================================================================
// Theme CSS Generation
// =============================================================================

function generateThemeCSS(theme: Theme): string {
  const vars = Object.entries(theme.variables)
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n    ');
  
  return `
  :root {
    ${vars}
  }
  
  body {
    margin: 0;
    padding: 0;
    min-height: 100vh;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: var(--text-primary);
    ${theme.backgroundMode === 'gradient' && theme.variables['--bg-gradient']
      ? `background: ${theme.variables['--bg-gradient']};`
      : `background-color: var(--bg-primary);`
    }
  }
  
  .canvas {
    position: relative;
    width: 100%;
    min-height: 100vh;
    max-width: 800px;
    margin: 0 auto;
    padding: 24px;
    box-sizing: border-box;
  }
  
  .block {
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .block-text p {
    margin: 0;
    color: var(--text-primary);
    line-height: 1.5;
  }
  
  .block-link .link-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 12px 24px;
    background: var(--accent-primary);
    color: white;
    text-decoration: none;
    font-weight: 500;
    border-radius: inherit;
    transition: background 0.2s;
  }
  
  .block-link .link-button:hover {
    background: var(--accent-secondary);
  }
  
  .block-image {
    padding: 0;
  }
  
  .block-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
  }
  
  .block-invalid {
    background: var(--bg-secondary);
    color: var(--text-muted);
    font-size: 12px;
  }
  
  .image-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  /* Header */
  .page-header {
    text-align: center;
    margin-bottom: 32px;
  }
  
  .page-title {
    font-size: 28px;
    font-weight: 700;
    margin: 0 0 8px 0;
    color: var(--text-primary);
  }
  
  .page-bio {
    font-size: 16px;
    color: var(--text-secondary);
    margin: 0;
  }
  
  /* CTA Button */
  .cta-container {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 100;
  }
  
  .cta-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: var(--accent-primary);
    color: white;
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  
  .cta-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  }
  
  .cta-logo {
    width: 16px;
    height: 16px;
    border-radius: 4px;
  }
  
  /* Footer */
  .footer {
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
  }
  
  .footer-link {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: rgba(0,0,0,0.05);
    color: var(--text-muted);
    text-decoration: none;
    font-size: 12px;
    border-radius: 999px;
    transition: background 0.2s;
  }
  
  .footer-link:hover {
    background: rgba(0,0,0,0.1);
    color: var(--text-secondary);
  }
  
  /* Responsive */
  @media (max-width: 640px) {
    .canvas {
      padding: 16px;
    }
    
    .cta-container {
      top: 12px;
      right: 12px;
    }
    
    .cta-button {
      padding: 8px 12px;
      font-size: 13px;
    }
  }`;
}

// =============================================================================
// Security Headers Meta Tags
// =============================================================================

function getSecurityMeta(): string {
  // CSP for static HTML (using meta tag)
  const cspParts = [
    "default-src 'self'",
    `img-src 'self' https: data:${STORAGE_DOMAIN ? ` ${STORAGE_DOMAIN}` : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ];
  
  return `
    <meta http-equiv="Content-Security-Policy" content="${cspParts.join('; ')}">
    <meta http-equiv="X-Content-Type-Options" content="nosniff">
    <meta name="referrer" content="strict-origin-when-cross-origin">`;
}

// =============================================================================
// Main Renderer
// =============================================================================

export interface RenderOptions {
  /** Base URL for CTA links (defaults to APP_ORIGIN) */
  appOrigin?: string;
  /** Include CTA button (default: true) */
  includeCta?: boolean;
  /** Include footer branding (default: true) */
  includeFooter?: boolean;
}

/**
 * Render a PageDoc to complete static HTML.
 */
export function renderPageHtml(doc: PageDoc, options: RenderOptions = {}): string {
  const {
    appOrigin = APP_ORIGIN,
    includeCta = true,
    includeFooter = true,
  } = options;
  
  const theme = getTheme(doc.themeId);
  const title = doc.title || 'My Corner';
  const description = doc.bio || `${title} - Built with ${APP_NAME}`;
  
  // Render blocks
  const blocksHtml = doc.blocks.map(renderBlock).join('\n');
  
  // Generate CSS
  const themeCSS = generateThemeCSS(theme);
  
  // Build the full HTML
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${getSecurityMeta()}
  
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  
  <!-- Open Graph -->
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  
  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
  
  <style>${themeCSS}</style>
</head>
<body>
  ${includeCta ? `
  <div class="cta-container">
    <a href="${appOrigin}/new" class="cta-button">
      <img src="${appOrigin}/logo.png" alt="" class="cta-logo">
      Make your own
    </a>
  </div>
  ` : ''}
  
  <div class="canvas">
    ${doc.title || doc.bio ? `
    <header class="page-header">
      ${doc.title ? `<h1 class="page-title">${escapeHtml(doc.title)}</h1>` : ''}
      ${doc.bio ? `<p class="page-bio">${escapeHtml(doc.bio)}</p>` : ''}
    </header>
    ` : ''}
    
    ${blocksHtml}
  </div>
  
  ${includeFooter ? `
  <footer class="footer">
    <a href="${appOrigin}/new" class="footer-link">
      Built with ${APP_NAME}
    </a>
  </footer>
  ` : ''}
</body>
</html>`;
}

/**
 * Estimate the size of rendered HTML.
 * Useful for rate limiting/abuse prevention.
 */
export function estimateHtmlSize(doc: PageDoc): number {
  // Base HTML template is roughly 3KB
  let size = 3000;
  
  // Add block content sizes
  for (const block of doc.blocks) {
    if (block.type === 'text') {
      size += block.content.text.length * 2; // HTML escaping may double
    } else if (block.type === 'link') {
      size += block.content.label.length + block.content.url.length;
    } else if (block.type === 'image') {
      size += block.content.url.length + (block.content.alt?.length || 0);
    }
  }
  
  // Theme CSS is roughly 2KB
  size += 2000;
  
  return size;
}

