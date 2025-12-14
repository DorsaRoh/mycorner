/**
 * Shared type definitions used across server and client
 */

export interface User {
  id: string;
  email: string;
  displayName?: string;
  createdAt: string;
}

export type BlockType = 'TEXT' | 'IMAGE' | 'LINK' | 'AUDIO';

// Simplified style system - only roundness and depth
export interface BlockStyle {
  // Roundness (applies directly to image border-radius)
  borderRadius: number;     // 0..1 (0 = sharp, 1 = fully rounded)

  // Depth (shadow)
  shadowStrength: number;   // 0..1 (0 = flat, 1 = floating)
  shadowSoftness: number;   // 0..1 (0 = sharp, 1 = very soft)
  shadowOffsetX: number;    // -1..1 (horizontal offset)
  shadowOffsetY: number;    // -1..1 (vertical offset)

  // Text styling (for TEXT blocks only)
  fontFamily?: string;      // Font family name
  fontSize?: number;        // Font size in px
  fontWeight?: number;      // Font weight (100-900)
  color?: string;           // Text color (rgba string)
  textOpacity?: number;     // Text opacity (0..1)
  textAlign?: 'left' | 'center' | 'right';  // Text alignment
}

// Default/neutral style values (no visible effect)
export const DEFAULT_STYLE: BlockStyle = {
  borderRadius: 0,
  shadowStrength: 0,
  shadowSoftness: 0.5,
  shadowOffsetX: 0,
  shadowOffsetY: 0.2,
  // Text defaults
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: 16,
  fontWeight: 400,
  color: 'rgba(0, 0, 0, 1)',
  textOpacity: 1,
  textAlign: 'left',
};

// Check if any style properties are non-default
export function hasActiveStyle(style?: BlockStyle): boolean {
  if (!style) return false;
  return (
    style.borderRadius > 0 ||
    style.shadowStrength > 0 ||
    // Text styling checks
    style.fontFamily !== DEFAULT_STYLE.fontFamily ||
    style.fontSize !== DEFAULT_STYLE.fontSize ||
    style.fontWeight !== DEFAULT_STYLE.fontWeight ||
    style.color !== DEFAULT_STYLE.color ||
    style.textOpacity !== DEFAULT_STYLE.textOpacity ||
    style.textAlign !== DEFAULT_STYLE.textAlign
  );
}

// Gradient overlay settings for effects
export interface GradientOverlay {
  strength: number;    // 0..1
  angle: number;       // 0..360 degrees
  colors: [string, string];
}

// Visual effects for blocks (primarily images, extensible to text later)
export interface BlockEffects {
  // Look section
  brightness?: number;   // -1..1 (0 = neutral)
  contrast?: number;     // -1..1 (0 = neutral)
  saturation?: number;   // -1..1 (0 = neutral)
  hueShift?: number;     // -180..180 degrees (0 = neutral)
  
  // Texture section
  pixelate?: number;     // 0..1 (0 = off)
  dither?: number;       // 0..1 (0 = off)
  noise?: number;        // 0..1 (0 = off)
  grainSize?: number;    // 0..1 (controls grain for noise/dither)
  
  // Atmosphere section
  blur?: number;         // 0..1 (0 = off)
  gradientOverlay?: GradientOverlay;
}

// Default/neutral effects values
export const DEFAULT_EFFECTS: BlockEffects = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hueShift: 0,
  pixelate: 0,
  dither: 0,
  noise: 0,
  grainSize: 0.5,
  blur: 0,
  gradientOverlay: {
    strength: 0,
    angle: 45,
    colors: ['#000000', '#ffffff'],
  },
};

export interface Block {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  style?: BlockStyle;      // Unified style system
  effects?: BlockEffects;  // Visual effects (optional)
}

// Background audio settings for a page
export interface BackgroundAudio {
  url: string;
  volume: number; // 0..1
  loop: boolean;
  enabled: boolean;
}

// Background decoration settings for a page
export interface BackgroundConfig {
  mode: "solid" | "gradient";
  solid?: { color: string; opacity: number };
  gradient?: {
    type: "linear" | "radial";
    colorA: string;
    colorB: string;
    angle: number; // only used for linear
    opacity: number;
  };
  texture?: {
    type: "noise" | "paper" | "grain" | "none";
    intensity: number; // clamp 0..0.2
    scale: number; // clamp 0.5..2
    opacity: number; // 0..1
  };
  lighting?: {
    vignette: number; // clamp 0..0.3
    brightness: number; // clamp -0.1..0.1
    contrast: number; // clamp -0.1..0.1
  };
  motion?: {
    enabled: boolean;
    speed: "slow" | "slower" | "slowest";
  };
}

export interface Page {
  id: string;
  owner: User | null;
  title?: string;
  isPublished: boolean;
  blocks: Block[];
  backgroundAudio?: BackgroundAudio;
  background?: BackgroundConfig;
  forkedFrom?: Page;
  createdAt: string;
  updatedAt: string;
}

export interface BlockInput {
  id?: string;
  type: BlockType;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  style?: BlockStyle;
  effects?: BlockEffects;
}

export interface CreatePageInput {
  title?: string;
}

export interface UpdatePageInput {
  title?: string;
  blocks?: BlockInput[];
  backgroundAudio?: BackgroundAudio;
  background?: BackgroundConfig;
}

export interface AuthPayload {
  success: boolean;
  message: string;
}
