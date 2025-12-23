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
import { REFERENCE_WIDTH, REFERENCE_HEIGHT } from '../../lib/canvas/coordinates';

// =============================================================================
// Configuration
// =============================================================================

const APP_ORIGIN = process.env.APP_ORIGIN || process.env.PUBLIC_URL || 'https://yourcorner.com';
// extract storage host from env
const STORAGE_DOMAIN = process.env.S3_PUBLIC_BASE_URL 
  ? new URL(process.env.S3_PUBLIC_BASE_URL).host 
  : '';

// optional secondary assets host
const ASSETS_DOMAIN = process.env.ASSETS_PUBLIC_BASE_URL
  ? new URL(process.env.ASSETS_PUBLIC_BASE_URL).host
  : '';

// allowed image domains - only these hosts are permitted for absolute urls
const ALLOWED_IMAGE_DOMAINS = new Set([
  STORAGE_DOMAIN,
  ASSETS_DOMAIN,
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
// URL Validation and Resolution
// =============================================================================

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * resolve a relative asset url to absolute using app origin.
 * this ensures static HTML served from R2 can load assets from the app domain.
 * 
 * @param url - the url to resolve (e.g., "/hero-flowers.png")
 * @param appOrigin - the app origin (e.g., "https://www.itsmycorner.com")
 * @returns absolute url if input was relative, otherwise unchanged
 */
function resolveAssetUrl(url: string, appOrigin: string): string {
  // only resolve relative urls (starting with /)
  if (!url.startsWith('/')) {
    return url;
  }
  
  // skip protocol-relative urls (starting with //)
  if (url.startsWith('//')) {
    return url;
  }
  
  // make absolute using app origin
  return `${appOrigin}${url}`;
}

/**
 * check if an image url is allowed.
 * allows relative urls (which will be resolved) and urls from allowed domains.
 */
function isAllowedImageUrl(url: string, appOrigin?: string): boolean {
  // allow relative urls (our own assets) - they'll be resolved to app origin
  if (url.startsWith('/') && !url.startsWith('//')) {
    return true;
  }
  
  try {
    const parsed = new URL(url);
    // must be http/https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    
    // allow urls from the app origin
    if (appOrigin) {
      try {
        const appOriginUrl = new URL(appOrigin);
        if (parsed.host === appOriginUrl.host) {
          return true;
        }
      } catch {
        // ignore invalid app origin
      }
    }
    
    // fail closed: if no storage domain configured, disallow all absolute urls
    if (ALLOWED_IMAGE_DOMAINS.size === 0) {
      return false;
    }
    // only allow if host matches configured storage/cdn domains
    return ALLOWED_IMAGE_DOMAINS.has(parsed.host);
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

function renderImageBlock(block: ImageBlock, appOrigin: string): string {
  const url = block.content.url;
  const alt = escapeHtml(block.content.alt || '');
  
  // validate image URL
  if (!isAllowedImageUrl(url, appOrigin)) {
    return `<div class="block block-image block-invalid" style="${getBlockStyles(block)}">
      <div class="image-placeholder">Image unavailable</div>
    </div>`;
  }
  
  // resolve relative urls to absolute using app origin
  const resolvedUrl = resolveAssetUrl(url, appOrigin);
  const safeUrl = escapeUrl(resolvedUrl);
  const style = getBlockStyles(block);
  
  return `<div class="block block-image" style="${style}">
    <img src="${safeUrl}" alt="${alt}" loading="lazy" decoding="async" />
  </div>`;
}

function renderBlock(block: Block, appOrigin: string): string {
  switch (block.type) {
    case 'text':
      return renderTextBlock(block);
    case 'link':
      return renderLinkBlock(block);
    case 'image':
      return renderImageBlock(block, appOrigin);
    default:
      return '';
  }
}

/**
 * calculate the required canvas height based on block positions.
 * ensures all blocks are visible by finding the bottom-most block edge.
 */
function calculateCanvasHeight(blocks: Block[]): number {
  if (blocks.length === 0) {
    return REFERENCE_HEIGHT;
  }
  
  let maxBottom = REFERENCE_HEIGHT;
  for (const block of blocks) {
    const bottom = block.y + block.height;
    if (bottom > maxBottom) {
      maxBottom = bottom;
    }
  }
  
  // add some padding at the bottom
  return maxBottom + 48;
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
    --reference-width: ${REFERENCE_WIDTH}px;
    --reference-height: ${REFERENCE_HEIGHT}px;
  }
  
  * {
    box-sizing: border-box;
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
    overflow-x: auto;
  }
  
  /* viewport wrapper - centers canvas and handles overflow on small screens */
  .viewport {
    width: 100%;
    min-height: 100vh;
    overflow-x: auto;
    display: flex;
    justify-content: center;
    padding: 24px 0;
  }
  
  /* canvas matches editor reference dimensions exactly */
  .canvas {
    position: relative;
    width: ${REFERENCE_WIDTH}px;
    min-height: ${REFERENCE_HEIGHT}px;
    flex-shrink: 0;
  }
  
  .block {
    overflow: hidden;
  }
  
  .block-text {
    display: block;
  }
  
  .block-text p {
    margin: 0;
    color: var(--text-primary);
    line-height: 1.5;
  }
  
  .block-link {
    display: flex;
    align-items: center;
    justify-content: center;
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
  }
  
  .block-image {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  
  .block-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
  }
  
  .block-invalid {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-secondary);
    color: var(--text-muted);
    font-size: 12px;
  }
  
  .image-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  /* header is positioned within the canvas coordinate space */
  .page-header {
    position: absolute;
    top: 24px;
    left: 24px;
    right: 24px;
    text-align: left;
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
  
  /* CTA Button - minimal, text-only, no hover effects for performance */
  .cta-container {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 100;
  }
  
  .cta-button {
    display: inline-block;
    padding: 8px 14px;
    background: var(--accent-primary);
    color: white;
    text-decoration: none;
    font-size: 13px;
    font-weight: 500;
    border-radius: 6px;
  }
  
  /* responsive scaling for mobile - scale down the entire canvas */
  @media (max-width: ${REFERENCE_WIDTH}px) {
    .viewport {
      justify-content: flex-start;
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
  // build img-src directive - only allow self, data:, and configured storage domains
  const imgSrcParts = ["'self'", 'data:'];
  if (STORAGE_DOMAIN) imgSrcParts.push(STORAGE_DOMAIN);
  if (ASSETS_DOMAIN) imgSrcParts.push(ASSETS_DOMAIN);
  
  // csp for static html - no scripts, strict policy
  const cspParts = [
    "default-src 'self'",
    `img-src ${imgSrcParts.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "script-src 'none'",  // no js needed for static pages
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "upgrade-insecure-requests",
  ];
  
  return `
    <meta http-equiv="Content-Security-Policy" content="${cspParts.join('; ')}">
    <meta http-equiv="X-Content-Type-Options" content="nosniff">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <meta http-equiv="Permissions-Policy" content="camera=(), microphone=(), geolocation=()">`;
}

// =============================================================================
// Main Renderer
// =============================================================================

export interface RenderOptions {
  /** base URL for CTA links and asset resolution (defaults to APP_ORIGIN) */
  appOrigin?: string;
  /** include CTA button (default: true) */
  includeCta?: boolean;
}

/**
 * Render a PageDoc to complete static HTML.
 */
export function renderPageHtml(doc: PageDoc, options: RenderOptions = {}): string {
  const {
    appOrigin = APP_ORIGIN,
    includeCta = true,
  } = options;
  
  const theme = getTheme(doc.themeId);
  const title = doc.title || 'My Corner';
  const description = doc.bio || `${title} - My corner of the web`;
  
  // render blocks with asset url resolution
  const blocksHtml = doc.blocks.map(block => renderBlock(block, appOrigin)).join('\n');
  
  // Generate CSS
  const themeCSS = generateThemeCSS(theme);
  
  // calculate canvas height based on block positions
  const canvasHeight = calculateCanvasHeight(doc.blocks);
  
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
  
  <style>${themeCSS}</style>
</head>
<body>
  ${includeCta ? `
  <div class="cta-container">
    <a href="${appOrigin}/new" class="cta-button">Make your own</a>
  </div>
  ` : ''}
  
  <div class="viewport">
    <div class="canvas" style="height: ${canvasHeight}px;">
      ${blocksHtml}
    </div>
  </div>
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

