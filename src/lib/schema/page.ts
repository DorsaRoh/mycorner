/**
 * PageDoc schema - single source of truth for page data structure.
 * 
 * The entire page is stored as one JSON document in the database.
 * This schema is validated at IO boundaries (publish, load).
 */

import { z } from 'zod';

// =============================================================================
// Block Style Schema (constrained, no arbitrary CSS)
// =============================================================================

/**
 * Safe style options - maps to predefined CSS classes, not raw CSS values.
 */
export const BlockStyleSchema = z.object({
  // Alignment
  align: z.enum(['left', 'center', 'right']).default('left'),
  
  // Card appearance
  card: z.boolean().default(false),
  
  // Border radius (maps to CSS class)
  radius: z.enum(['none', 'sm', 'md', 'lg', 'full']).default('none'),
  
  // Shadow (maps to CSS class)
  shadow: z.enum(['none', 'sm', 'md', 'lg']).default('none'),
}).partial();

export type BlockStyle = z.infer<typeof BlockStyleSchema>;

// =============================================================================
// Block Content Schemas (per type)
// =============================================================================

export const TextContentSchema = z.object({
  text: z.string(),
});

export const LinkContentSchema = z.object({
  label: z.string(),
  url: z.string().url(),
});

export const ImageContentSchema = z.object({
  url: z.string(), // Can be blob:, data:, or https:// - validated at publish time
  alt: z.string().optional(),
});

// =============================================================================
// Block Schemas (discriminated union by type)
// =============================================================================

const BlockBase = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number().optional(),
  style: BlockStyleSchema.optional(),
});

export const TextBlockSchema = BlockBase.extend({
  type: z.literal('text'),
  content: TextContentSchema,
});

export const LinkBlockSchema = BlockBase.extend({
  type: z.literal('link'),
  content: LinkContentSchema,
});

export const ImageBlockSchema = BlockBase.extend({
  type: z.literal('image'),
  content: ImageContentSchema,
});

export const BlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  LinkBlockSchema,
  ImageBlockSchema,
]);

export type Block = z.infer<typeof BlockSchema>;
export type TextBlock = z.infer<typeof TextBlockSchema>;
export type LinkBlock = z.infer<typeof LinkBlockSchema>;
export type ImageBlock = z.infer<typeof ImageBlockSchema>;

// =============================================================================
// PageDoc Schema (the entire page as one document)
// =============================================================================

export const PageDocSchema = z.object({
  /** Schema version for forward compatibility */
  version: z.literal(1),
  
  /** Page title (shown in browser tab, OG tags) */
  title: z.string().optional(),
  
  /** Short bio/description */
  bio: z.string().optional(),
  
  /** Theme ID from presets */
  themeId: z.string().default('default'),
  
  /** Theme overrides (keep minimal for MVP) */
  themeOverrides: z.record(z.string(), z.unknown()).optional(),
  
  /** All blocks on the page */
  blocks: z.array(BlockSchema).default([]),
});

export type PageDoc = z.infer<typeof PageDocSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate a PageDoc, returning typed result or error.
 */
export function validatePageDoc(data: unknown): 
  { success: true; data: PageDoc } | 
  { success: false; error: string } {
  const result = PageDocSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const firstError = result.error.issues[0];
  return { 
    success: false, 
    error: `${firstError.path.join('.')}: ${firstError.message}` 
  };
}

/**
 * Create an empty PageDoc with defaults.
 */
export function createEmptyPageDoc(): PageDoc {
  return {
    version: 1,
    title: undefined,
    bio: undefined,
    themeId: 'default',
    blocks: [],
  };
}

/**
 * Generate a unique block ID.
 */
export function generateBlockId(): string {
  return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// =============================================================================
// Legacy Conversion Helpers
// =============================================================================

/**
 * Convert legacy Block format to new PageDoc Block format.
 * The legacy format stores content as a JSON string, we need structured content.
 */
export function convertLegacyBlock(legacy: {
  id: string;
  type: 'TEXT' | 'IMAGE' | 'LINK';
  x: number;
  y: number;
  width: number;
  height: number;
  content: string; // JSON string in legacy format
  style?: Record<string, unknown>;
  rotation?: number;
}): Block | null {
  try {
    const baseBlock = {
      id: legacy.id,
      x: legacy.x,
      y: legacy.y,
      width: legacy.width,
      height: legacy.height,
      rotation: legacy.rotation,
      style: convertLegacyStyle(legacy.style),
    };

    switch (legacy.type) {
      case 'TEXT':
        return {
          ...baseBlock,
          type: 'text' as const,
          content: { text: legacy.content },
        };
      case 'IMAGE':
        return {
          ...baseBlock,
          type: 'image' as const,
          content: { url: legacy.content, alt: undefined },
        };
      case 'LINK': {
        // Legacy link content might be URL or JSON
        let linkContent: { label: string; url: string };
        try {
          const parsed = JSON.parse(legacy.content);
          linkContent = { 
            label: parsed.label || parsed.text || 'Link',
            url: parsed.url || legacy.content,
          };
        } catch {
          linkContent = { label: 'Link', url: legacy.content };
        }
        return {
          ...baseBlock,
          type: 'link' as const,
          content: linkContent,
        };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Convert legacy style object to new constrained style.
 */
function convertLegacyStyle(legacy?: Record<string, unknown>): BlockStyle | undefined {
  if (!legacy) return undefined;
  
  const style: BlockStyle = {};
  
  // Map textAlign to align
  if (legacy.textAlign) {
    const align = legacy.textAlign as string;
    if (align === 'left' || align === 'center' || align === 'right') {
      style.align = align;
    }
  }
  
  // Map borderRadius to radius enum
  if (typeof legacy.borderRadius === 'number') {
    const r = legacy.borderRadius;
    if (r <= 0) style.radius = 'none';
    else if (r < 0.25) style.radius = 'sm';
    else if (r < 0.5) style.radius = 'md';
    else if (r < 0.75) style.radius = 'lg';
    else style.radius = 'full';
  }
  
  // Map shadowStrength to shadow enum
  if (typeof legacy.shadowStrength === 'number') {
    const s = legacy.shadowStrength;
    if (s <= 0) style.shadow = 'none';
    else if (s < 0.33) style.shadow = 'sm';
    else if (s < 0.66) style.shadow = 'md';
    else style.shadow = 'lg';
  }
  
  return Object.keys(style).length > 0 ? style : undefined;
}

/**
 * Convert legacy page data to PageDoc format.
 */
export function convertLegacyPage(legacy: {
  title?: string;
  blocks: Array<{
    id: string;
    type: 'TEXT' | 'IMAGE' | 'LINK';
    x: number;
    y: number;
    width: number;
    height: number;
    content: string;
    style?: Record<string, unknown>;
    rotation?: number;
  }>;
  background?: {
    mode: string;
    solid?: { color: string };
    gradient?: { type: string; colorA: string; colorB: string; angle: number };
  };
}): PageDoc {
  const blocks = legacy.blocks
    .map(convertLegacyBlock)
    .filter((b): b is Block => b !== null);
  
  // Map background to themeId (simple mapping for now)
  let themeId = 'default';
  if (legacy.background?.mode === 'gradient') {
    themeId = 'gradient';
  } else if (legacy.background?.solid?.color) {
    // Could map to specific theme based on color
    themeId = 'solid';
  }
  
  return {
    version: 1,
    title: legacy.title,
    bio: undefined,
    themeId,
    blocks,
  };
}

