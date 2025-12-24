/**
 * Platform UI Contrast System
 * 
 * This module provides a unified theming layer for platform UI elements
 * (buttons, panels, toasts, etc.) that automatically adapts to the user's
 * page background for optimal contrast and readability.
 * 
 * Platform UI is distinct from user content - it includes:
 * - Publish button, background controls
 * - "Make your own" CTA
 * - Edit/Share toolbar
 * - Feedback buttons
 * - Modals, toasts, banners
 * 
 * Usage:
 * 1. Call computeUiTokens(background) to get token values
 * 2. Apply tokens via CSS variables on a container element
 * 3. Use the token variables in component styles
 */

import type { BackgroundConfig } from '@/shared/types';

// =============================================================================
// Types
// =============================================================================

export interface UiTokens {
  /** Primary surface background for buttons/chips */
  '--platform-surface': string;
  /** Hover/secondary surface */
  '--platform-surface-hover': string;
  /** Elevated surface (popovers, panels) */
  '--platform-surface-elevated': string;
  /** Border color */
  '--platform-border': string;
  /** Primary text color */
  '--platform-text': string;
  /** Muted text color */
  '--platform-text-muted': string;
  /** Text shadow for readability on complex backgrounds */
  '--platform-text-shadow': string;
  /** Box shadow for depth */
  '--platform-shadow': string;
  /** Focus ring color */
  '--platform-ring': string;
  /** Backdrop blur amount */
  '--platform-blur': string;
  /** Mode indicator for components that need conditional logic */
  '--platform-mode': 'light' | 'dark' | 'glass';
}

export type UiMode = 'light' | 'dark' | 'glass';

// =============================================================================
// Color Utilities
// =============================================================================

/**
 * Parse a color string (hex, rgb, rgba) and return RGB values.
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
  const rs = r / 255;
  const gs = g / 255;
  const bs = b / 255;
  
  const rg = rs <= 0.03928 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
  const gg = gs <= 0.03928 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
  const bg = bs <= 0.03928 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);
  
  return 0.2126 * rg + 0.7152 * gg + 0.0722 * bg;
}

/**
 * Determine UI mode based on background configuration.
 * - 'light': Light background, use dark UI elements
 * - 'dark': Dark background, use light UI elements  
 * - 'glass': Image/complex background, use frosted glass effect
 */
export function getUiMode(background?: BackgroundConfig): UiMode {
  if (!background) return 'light';
  
  if (background.mode === 'solid' && background.solid) {
    const rgb = parseColor(background.solid.color);
    if (rgb) {
      const luminance = getLuminance(rgb.r, rgb.g, rgb.b);
      return luminance < 0.5 ? 'dark' : 'light';
    }
  }
  
  if (background.mode === 'gradient' && background.gradient) {
    const rgbA = parseColor(background.gradient.colorA);
    const rgbB = parseColor(background.gradient.colorB);
    if (rgbA && rgbB) {
      const lumA = getLuminance(rgbA.r, rgbA.g, rgbA.b);
      const lumB = getLuminance(rgbB.r, rgbB.g, rgbB.b);
      const avgLuminance = (lumA + lumB) / 2;
      return avgLuminance < 0.5 ? 'dark' : 'light';
    }
  }
  
  if (background.mode === 'image' && background.image?.url) {
    // Images get the glass treatment for guaranteed readability
    return 'glass';
  }
  
  return 'light';
}

// =============================================================================
// Token Presets
// =============================================================================

const LIGHT_TOKENS: UiTokens = {
  '--platform-surface': 'rgba(255, 255, 255, 0.72)',
  '--platform-surface-hover': 'rgba(255, 255, 255, 0.88)',
  '--platform-surface-elevated': 'rgba(255, 255, 255, 0.95)',
  '--platform-border': 'rgba(0, 0, 0, 0.08)',
  '--platform-text': 'rgba(0, 0, 0, 0.85)',
  '--platform-text-muted': 'rgba(0, 0, 0, 0.55)',
  '--platform-text-shadow': 'none',
  '--platform-shadow': '0 2px 12px rgba(0, 0, 0, 0.08)',
  '--platform-ring': 'rgba(0, 0, 0, 0.15)',
  '--platform-blur': '12px',
  '--platform-mode': 'light',
};

const DARK_TOKENS: UiTokens = {
  '--platform-surface': 'rgba(0, 0, 0, 0.45)',
  '--platform-surface-hover': 'rgba(0, 0, 0, 0.6)',
  '--platform-surface-elevated': 'rgba(20, 20, 20, 0.92)',
  '--platform-border': 'rgba(255, 255, 255, 0.12)',
  '--platform-text': 'rgba(255, 255, 255, 0.95)',
  '--platform-text-muted': 'rgba(255, 255, 255, 0.7)',
  '--platform-text-shadow': '0 1px 2px rgba(0, 0, 0, 0.3)',
  '--platform-shadow': '0 2px 12px rgba(0, 0, 0, 0.25)',
  '--platform-ring': 'rgba(255, 255, 255, 0.25)',
  '--platform-blur': '12px',
  '--platform-mode': 'dark',
};

// Glass tokens: high-contrast frosted glass for image backgrounds
const GLASS_TOKENS: UiTokens = {
  '--platform-surface': 'rgba(255, 255, 255, 0.82)',
  '--platform-surface-hover': 'rgba(255, 255, 255, 0.92)',
  '--platform-surface-elevated': 'rgba(255, 255, 255, 0.96)',
  '--platform-border': 'rgba(0, 0, 0, 0.1)',
  '--platform-text': 'rgba(0, 0, 0, 0.9)',
  '--platform-text-muted': 'rgba(0, 0, 0, 0.6)',
  '--platform-text-shadow': '0 0 8px rgba(255, 255, 255, 0.5)',
  '--platform-shadow': '0 4px 20px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0, 0, 0, 0.08)',
  '--platform-ring': 'rgba(0, 0, 0, 0.2)',
  '--platform-blur': '16px',
  '--platform-mode': 'glass',
};

// =============================================================================
// Main Function
// =============================================================================

/**
 * Compute platform UI tokens based on page background.
 * Returns CSS variable values that ensure readable, consistent UI.
 */
export function computeUiTokens(background?: BackgroundConfig): UiTokens {
  const mode = getUiMode(background);
  
  switch (mode) {
    case 'dark':
      return DARK_TOKENS;
    case 'glass':
      return GLASS_TOKENS;
    case 'light':
    default:
      return LIGHT_TOKENS;
  }
}

/**
 * Convert tokens to a CSS custom properties object suitable for inline styles.
 */
export function tokensToStyle(tokens: UiTokens): React.CSSProperties {
  return tokens as unknown as React.CSSProperties;
}

/**
 * Get tokens as a style object for direct application to a container element.
 */
export function getUiTokenStyles(background?: BackgroundConfig): React.CSSProperties {
  return tokensToStyle(computeUiTokens(background));
}

// =============================================================================
// Legacy Compatibility
// =============================================================================

/**
 * For backward compatibility with existing code that uses 'dark' | 'light'.
 * Maps to the existing getBackgroundBrightness behavior.
 */
export function getBackgroundBrightnessCompat(background?: BackgroundConfig): 'dark' | 'light' {
  const mode = getUiMode(background);
  // Glass mode uses light-text-on-light-surface, so treat as 'light' background
  return mode === 'dark' ? 'dark' : 'light';
}

