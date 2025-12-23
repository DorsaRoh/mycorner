/**
 * Draft storage and conversion utilities.
 * 
 * This module provides the interface between the Editor (legacy format)
 * and the new PageDoc format used for storage and publishing.
 */

import type { Block as LegacyBlock, BackgroundConfig } from '@/shared/types';
import type { PageDoc, Block as PageDocBlock } from '@/lib/schema/page';
import { getDraft, saveDraft, clearDraft, hasDraft, migrateLegacyDraft, type DraftDoc } from './storage';

// Re-export storage functions
export { getDraft, saveDraft, clearDraft, hasDraft, migrateLegacyDraft };
export type { DraftDoc };

// =============================================================================
// Format Conversion: Legacy ↔ PageDoc
// =============================================================================

/**
 * Convert legacy block format (used by Editor) to PageDoc block format.
 */
export function legacyBlockToPageDoc(block: LegacyBlock): PageDocBlock | null {
  const base = {
    id: block.id,
    x: block.x,
    y: block.y,
    width: block.width,
    height: block.height,
    rotation: block.rotation,
    style: convertLegacyStyle(block.style),
  };
  
  switch (block.type) {
    case 'TEXT':
      return {
        ...base,
        type: 'text' as const,
        content: { text: block.content },
      };
    case 'IMAGE':
      return {
        ...base,
        type: 'image' as const,
        content: { url: block.content, alt: undefined },
      };
    case 'LINK':
      let linkContent: { label: string; url: string };
      try {
        const parsed = JSON.parse(block.content);
        linkContent = {
          label: String(parsed.label || parsed.text || 'Link'),
          url: String(parsed.url || block.content),
        };
      } catch {
        linkContent = { label: 'Link', url: block.content };
      }
      return {
        ...base,
        type: 'link' as const,
        content: linkContent,
      };
    default:
      return null;
  }
}

/**
 * Convert legacy style object to new constrained style.
 */
function convertLegacyStyle(legacy?: LegacyBlock['style']): PageDocBlock['style'] | undefined {
  if (!legacy) return undefined;
  
  const style: NonNullable<PageDocBlock['style']> = {};
  
  // Map textAlign to align
  if (legacy.textAlign) {
    style.align = legacy.textAlign;
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
 * Convert PageDoc block format to legacy block format (for Editor).
 */
export function pageDocBlockToLegacy(block: PageDocBlock): LegacyBlock {
  const base = {
    id: block.id,
    type: block.type.toUpperCase() as 'TEXT' | 'IMAGE' | 'LINK',
    x: block.x,
    y: block.y,
    width: block.width,
    height: block.height,
    rotation: block.rotation,
    style: pageDocStyleToLegacy(block.style),
  };
  
  switch (block.type) {
    case 'text':
      return { ...base, type: 'TEXT', content: block.content.text };
    case 'image':
      return { ...base, type: 'IMAGE', content: block.content.url };
    case 'link':
      return { ...base, type: 'LINK', content: JSON.stringify(block.content) };
    default:
      return { ...base, content: '' };
  }
}

/**
 * Convert PageDoc style to legacy style format.
 */
function pageDocStyleToLegacy(style?: PageDocBlock['style']): LegacyBlock['style'] | undefined {
  if (!style) return undefined;
  
  const result: LegacyBlock['style'] = {
    borderRadius: 0,
    shadowStrength: 0,
    shadowSoftness: 0.5,
    shadowOffsetX: 0,
    shadowOffsetY: 0.2,
  };
  
  if (style.align) {
    result.textAlign = style.align;
  }
  
  if (style.radius) {
    const radiusMap: Record<string, number> = {
      none: 0,
      sm: 0.15,
      md: 0.35,
      lg: 0.65,
      full: 1,
    };
    result.borderRadius = radiusMap[style.radius] ?? 0;
  }
  
  if (style.shadow) {
    const shadowMap: Record<string, number> = {
      none: 0,
      sm: 0.2,
      md: 0.5,
      lg: 0.8,
    };
    result.shadowStrength = shadowMap[style.shadow] ?? 0;
  }
  
  return result;
}

/**
 * Convert legacy blocks array to PageDoc blocks.
 */
export function legacyBlocksToPageDoc(blocks: LegacyBlock[]): PageDocBlock[] {
  return blocks
    .map(legacyBlockToPageDoc)
    .filter((b): b is PageDocBlock => b !== null);
}

/**
 * Convert PageDoc blocks to legacy blocks.
 */
export function pageDocBlocksToLegacy(blocks: PageDocBlock[]): LegacyBlock[] {
  return blocks.map(pageDocBlockToLegacy);
}

// =============================================================================
// Draft Save/Load with Format Conversion
// =============================================================================

/**
 * Save editor state as a draft in PageDoc format.
 */
export function saveEditorDraft(
  blocks: LegacyBlock[],
  title: string,
  themeId: string = 'default'
): void {
  const doc: PageDoc = {
    version: 1,
    title: title || undefined,
    bio: undefined,
    themeId,
    blocks: legacyBlocksToPageDoc(blocks),
  };
  
  saveDraft(doc);
}

/**
 * Load draft and convert to legacy format for Editor.
 */
export function loadEditorDraft(): {
  blocks: LegacyBlock[];
  title: string;
  themeId: string;
} | null {
  const draft = getDraft();
  if (!draft?.doc) return null;
  
  return {
    blocks: pageDocBlocksToLegacy(draft.doc.blocks),
    title: draft.doc.title || '',
    themeId: draft.doc.themeId || 'default',
  };
}

/**
 * Get current draft as PageDoc (for publishing).
 */
export function getDraftAsPageDoc(): PageDoc | null {
  const draft = getDraft();
  return draft?.doc || null;
}
