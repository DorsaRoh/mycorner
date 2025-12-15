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

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

export function isImageUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return IMAGE_EXTENSIONS.some(ext => lowerUrl.includes(ext));
}

/**
 * Parse a color string (hex, rgb, rgba) and return RGB values.
 * Returns null if parsing fails.
 */
function parseColor(color: string): { r: number; g: number; b: number } | null {
  if (!color) return null;
  
  // Handle hex colors
  const hexMatch = color.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16),
    };
  }
  
  // Handle short hex colors
  const shortHexMatch = color.match(/^#?([a-f\d])([a-f\d])([a-f\d])$/i);
  if (shortHexMatch) {
    return {
      r: parseInt(shortHexMatch[1] + shortHexMatch[1], 16),
      g: parseInt(shortHexMatch[2] + shortHexMatch[2], 16),
      b: parseInt(shortHexMatch[3] + shortHexMatch[3], 16),
    };
  }
  
  // Handle rgb/rgba colors
  const rgbMatch = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
    };
  }
  
  return null;
}

/**
 * Calculate relative luminance of a color (0-1 scale).
 * Uses the W3C formula for perceived brightness.
 */
function getLuminance(r: number, g: number, b: number): number {
  // Normalize to 0-1
  const rs = r / 255;
  const gs = g / 255;
  const bs = b / 255;
  
  // Apply gamma correction
  const rg = rs <= 0.03928 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
  const gg = gs <= 0.03928 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
  const bg = bs <= 0.03928 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);
  
  // Calculate luminance
  return 0.2126 * rg + 0.7152 * gg + 0.0722 * bg;
}

/**
 * Determine if a background is dark or light based on its configuration.
 * Returns 'dark' if text should be light, 'light' if text should be dark.
 */
export function getBackgroundBrightness(background?: {
  mode: 'solid' | 'gradient' | 'image';
  solid?: { color: string };
  gradient?: { type: 'linear' | 'radial'; colorA: string; colorB: string; angle: number };
  image?: { url: string; fit: 'cover' | 'contain' | 'fill' | 'tile'; position: string; opacity: number };
}): 'dark' | 'light' {
  if (!background) return 'light'; // Default to light background
  
  if (background.mode === 'solid' && background.solid) {
    const rgb = parseColor(background.solid.color);
    if (rgb) {
      const luminance = getLuminance(rgb.r, rgb.g, rgb.b);
      return luminance < 0.5 ? 'dark' : 'light';
    }
  } else if (background.mode === 'gradient' && background.gradient) {
    const rgbA = parseColor(background.gradient.colorA);
    const rgbB = parseColor(background.gradient.colorB);
    if (rgbA && rgbB) {
      // Average the luminance of both colors
      const lumA = getLuminance(rgbA.r, rgbA.g, rgbA.b);
      const lumB = getLuminance(rgbB.r, rgbB.g, rgbB.b);
      const avgLuminance = (lumA + lumB) / 2;
      return avgLuminance < 0.5 ? 'dark' : 'light';
    }
  } else if (background.mode === 'image') {
    // For images, we can't easily determine brightness
    // Default to light (dark text) since most images have varied colors
    // The frosted glass effect should help with readability
    return 'light';
  }
  
  return 'light'; // Default fallback
}

/**
 * Compute background styles from BackgroundConfig.
 * Returns canvasStyle (for solid/gradient) and bgImageStyle (for image layer with opacity).
 */
export function getBackgroundStyles(background?: {
  mode: 'solid' | 'gradient' | 'image';
  solid?: { color: string };
  gradient?: { type: 'linear' | 'radial'; colorA: string; colorB: string; angle: number };
  image?: { url: string; fit: 'cover' | 'contain' | 'fill' | 'tile'; position: string; opacity: number };
}): { canvasStyle: React.CSSProperties; bgImageStyle: React.CSSProperties | null } {
  const canvasStyle: React.CSSProperties = {};
  let bgImageStyle: React.CSSProperties | null = null;

  if (!background) return { canvasStyle, bgImageStyle };

  if (background.mode === 'solid' && background.solid) {
    canvasStyle.background = background.solid.color;
  } else if (background.mode === 'gradient' && background.gradient) {
    const { type, colorA, colorB, angle } = background.gradient;
    canvasStyle.background = type === 'radial'
      ? `radial-gradient(circle, ${colorA} 0%, ${colorB} 100%)`
      : `linear-gradient(${angle}deg, ${colorA} 0%, ${colorB} 100%)`;
  } else if (background.mode === 'image' && background.image?.url) {
    const { url, fit, position, opacity } = background.image;
    bgImageStyle = {
      backgroundImage: `url(${url})`,
      backgroundSize: fit === 'tile' ? 'auto' : fit,
      backgroundPosition: position,
      backgroundRepeat: fit === 'tile' ? 'repeat' : 'no-repeat',
      opacity,
    };
  }

  return { canvasStyle, bgImageStyle };
}

/**
 * Generate a very subtle lighter overlay color for the margin zones.
 * Nearly invisible - just a hint to indicate the safe area boundary.
 */
export function getMarginOverlayColor(background?: {
  mode: 'solid' | 'gradient' | 'image';
  solid?: { color: string };
  gradient?: { type: 'linear' | 'radial'; colorA: string; colorB: string; angle: number };
  image?: { url: string; fit: 'cover' | 'contain' | 'fill' | 'tile'; position: string; opacity: number };
}): string {
  const brightness = getBackgroundBrightness(background);
  
  // Very subtle overlay - barely visible, just a hint
  if (brightness === 'dark') {
    return 'rgba(255, 255, 255, 0.03)';
  } else {
    return 'rgba(255, 255, 255, 0.15)';
  }
}

