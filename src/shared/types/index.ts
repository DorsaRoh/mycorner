/**
 * Shared type definitions used across server and client
 */

export interface User {
  id: string;
  email: string;
  name?: string;
  username?: string;
  avatarUrl?: string;
  createdAt: string;
}

export type BlockType = 'TEXT' | 'IMAGE' | 'LINK';

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
  fontStyle?: 'normal' | 'italic';  // Font style
  color?: string;           // Text color (rgba string)
  textOpacity?: number;     // Text opacity (0..1)
  textAlign?: 'left' | 'center' | 'right';  // Text alignment
  lineHeight?: number;      // Line height multiplier
  textDecoration?: 'none' | 'underline' | 'line-through';  // Text decoration
}

// Default/neutral style values (no visible effect)
export const DEFAULT_STYLE: BlockStyle = {
  borderRadius: 0,
  shadowStrength: 0,
  shadowSoftness: 0.5,
  shadowOffsetX: 0,
  shadowOffsetY: 0.2,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: 16,
  fontWeight: 400,
  color: 'rgba(0, 0, 0, 1)',
  textOpacity: 1,
  textAlign: 'left',
};

// Visual effects for blocks (CSS filter-based)
export interface BlockEffects {
  brightness?: number;   // -1..1 (0 = neutral)
  contrast?: number;     // -1..1 (0 = neutral)
  saturation?: number;   // -1..1 (0 = neutral)
  hueShift?: number;     // -180..180 degrees (0 = neutral)
  blur?: number;         // 0..1 (0 = off)
}

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
  rotation?: number;       // Rotation in degrees (-180 to 180)
  isStarter?: boolean;     // True if this is a starter/placeholder block
}

// Background decoration settings for a page
export interface BackgroundConfig {
  mode: "solid" | "gradient" | "image";
  solid?: { color: string };
  gradient?: {
    type: "linear" | "radial";
    colorA: string;
    colorB: string;
    angle: number; // only used for linear
  };
  image?: {
    url: string;
    fit: "cover" | "contain" | "fill" | "tile";
    position: "center" | "top" | "bottom" | "left" | "right";
    opacity: number; // 0..1
  };
}

export interface Page {
  id: string;
  owner: User | null;
  title?: string;
  isPublished: boolean;
  blocks: Block[];
  background?: BackgroundConfig;
  forkedFrom?: Page;
  createdAt: string;
  updatedAt: string;
  serverRevision: number;
  schemaVersion: number;
}

/**
 * Save state machine states:
 * - idle: No changes yet or just loaded
 * - dirty: Local changes not saved yet
 * - saving: In-flight request
 * - saved: Server acknowledged latest version
 * - error: Last attempt failed; still dirty
 */
export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/**
 * Result of an update operation with conflict detection
 */
export interface UpdatePageResult {
  page: Page | null;
  conflict: boolean;
  currentServerRevision: number | null;
  acceptedLocalRevision: number | null;
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
  background?: BackgroundConfig;
}

export interface AuthPayload {
  success: boolean;
  message: string;
}
