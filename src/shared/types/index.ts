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

// Unified style system - all continuous parameters (0..1 or -1..1)
export interface BlockStyle {
  // Shape
  borderRadius: number;     // 0..1 (0 = sharp, 1 = fully rounded)
  borderWidth: number;      // 0..1 (0 = no border, 1 = thick border)
  
  // Edge
  borderSoftness: number;   // 0..1 (0 = crisp, 1 = soft/feathered)
  borderColor: string;      // rgba color string
  
  // Depth
  shadowStrength: number;   // 0..1 (0 = no shadow)
  shadowSoftness: number;   // 0..1 (0 = sharp, 1 = very soft)
  shadowOffsetX: number;    // -1..1 (horizontal offset)
  shadowOffsetY: number;    // -1..1 (vertical offset)
  
  // Presence
  opacity: number;          // 0..1 (1 = fully visible)
}

// Default/neutral style values (no visible effect)
export const DEFAULT_STYLE: BlockStyle = {
  borderRadius: 0,
  borderWidth: 0,
  borderSoftness: 0,
  borderColor: 'rgba(0, 0, 0, 0.2)',
  shadowStrength: 0,
  shadowSoftness: 0.5,
  shadowOffsetX: 0,
  shadowOffsetY: 0.2,
  opacity: 1,
};

// Check if any style properties are non-default
export function hasActiveStyle(style?: BlockStyle): boolean {
  if (!style) return false;
  return (
    style.borderRadius > 0 ||
    style.borderWidth > 0 ||
    style.borderSoftness > 0 ||
    style.shadowStrength > 0 ||
    style.opacity < 1
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

export interface Page {
  id: string;
  owner: User | null;
  title?: string;
  isPublished: boolean;
  blocks: Block[];
  backgroundAudio?: BackgroundAudio;
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
}

export interface AuthPayload {
  success: boolean;
  message: string;
}
