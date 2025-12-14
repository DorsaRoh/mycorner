/**
 * Shared utility functions for block styling
 * Used by both editor Block.tsx and viewer ViewerBlock.tsx
 */

import type { BlockStyle } from '@/shared/types';
import { DEFAULT_STYLE } from '@/shared/types';

/**
 * Convert BlockStyle to inline CSS styles for block container
 * Returns separate styles for outer (border-radius, shadow) and inner (clipping)
 */
export function getBlockStyles(
  style?: BlockStyle,
  blockWidth?: number,
  blockHeight?: number
): {
  outer: React.CSSProperties;
  inner: React.CSSProperties;
} {
  if (!style) return { outer: {}, inner: {} };

  const s = { ...DEFAULT_STYLE, ...style };
  const size = Math.min(blockWidth || 200, blockHeight || 200);

  // Roundness: border-radius applied directly
  const borderRadiusPx = s.borderRadius * (size / 2);

  // Depth: shadow calculations
  const shadowBlurPx = s.shadowSoftness * 40;
  const shadowOffsetXPx = s.shadowOffsetX * 30;
  const shadowOffsetYPx = s.shadowOffsetY * 30;
  const shadowOpacity = s.shadowStrength * 0.5;

  const outer: React.CSSProperties = {};
  const inner: React.CSSProperties = {};

  // Roundness - apply to both outer (for selection halo) and inner (for clipping)
  if (s.borderRadius > 0) {
    outer.borderRadius = `${borderRadiusPx}px`;
    inner.borderRadius = `${borderRadiusPx}px`;
    inner.overflow = 'hidden';
  }

  // Depth (shadow) - on outer block
  if (s.shadowStrength > 0) {
    outer.boxShadow = `${shadowOffsetXPx}px ${shadowOffsetYPx}px ${shadowBlurPx}px rgba(0, 0, 0, ${shadowOpacity})`;
  }

  return { outer, inner };
}

/**
 * Get text-specific CSS styles for TEXT and LINK blocks
 * Padding scales proportionally with font size for consistent visual appearance
 */
export function getTextStyles(style?: BlockStyle): React.CSSProperties {
  if (!style) return {};
  const s = { ...DEFAULT_STYLE, ...style };
  const fontSize = s.fontSize || 16;
  
  // Padding proportional to font size (roughly 10% vertical, 15% horizontal)
  const paddingV = Math.round(fontSize * 0.1);
  const paddingH = Math.round(fontSize * 0.15);
  
  return {
    fontFamily: s.fontFamily,
    fontSize: `${fontSize}px`,
    fontWeight: s.fontWeight,
    color: s.color,
    opacity: s.textOpacity,
    textAlign: s.textAlign,
    padding: `${paddingV}px ${paddingH}px`,
  };
}

/**
 * Parse link content - supports both simple URLs and {name, url} JSON format
 */
export function parseLinkContent(content: string): { name: string; url: string } {
  if (!content) return { name: '', url: '' };

  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === 'object' && parsed !== null && ('name' in parsed || 'url' in parsed)) {
      return { name: parsed.name || '', url: parsed.url || '' };
    }
  } catch {
    // Not JSON, treat as simple URL
  }

  // Simple URL string - extract hostname as default name
  try {
    const url = new URL(content);
    return { name: url.hostname.replace('www.', ''), url: content };
  } catch {
    return { name: content, url: content };
  }
}

/**
 * Serialize link content to JSON format
 */
export function serializeLinkContent(name: string, url: string): string {
  return JSON.stringify({ name, url });
}

// Image extensions for URL detection
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

/**
 * Check if a URL points to an image based on extension
 */
export function isImageUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return IMAGE_EXTENSIONS.some(ext => lowerUrl.includes(ext));
}

