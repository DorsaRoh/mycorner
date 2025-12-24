/**
 * Draft storage for anonymous page editing.
 * 
 * SINGLE KEY PATTERN:
 * All draft data is stored in ONE localStorage key: 'yourcorner:draft:v1'
 * 
 * This stores the complete PageDoc (or a wrapper with metadata).
 * No draft IDs, no prefixes, no multiple keys.
 */

import type { PageDoc } from '@/lib/schema/page';

// =============================================================================
// Constants
// =============================================================================

const DRAFT_KEY = 'yourcorner:draft:v1';

// Legacy keys to migrate from (one-time migration)
const LEGACY_KEYS = [
  'mycorner:draft:',
  'mycorner:activeDraft',
  'mycorner:authContinuation',
  'mycorner:starterDismissed:',
  'mycorner:publishToast',
];

// =============================================================================
// Draft Interface
// =============================================================================

export interface DraftDoc {
  /** The page document */
  doc: PageDoc;
  /** Timestamp of last update */
  updatedAt: number;
  /** Timestamp of creation */
  createdAt: number;
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Get the current draft.
 */
export function getDraft(): DraftDoc | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const data = localStorage.getItem(DRAFT_KEY);
    if (!data) return null;
    
    const parsed = JSON.parse(data);
    
    // Validate basic structure
    if (!parsed.doc || typeof parsed.updatedAt !== 'number') {
      return null;
    }
    
    return parsed as DraftDoc;
  } catch {
    return null;
  }
}

/**
 * Save a draft.
 */
export function saveDraft(doc: PageDoc): void {
  if (typeof window === 'undefined') return;
  
  try {
    const existing = getDraft();
    const draft: DraftDoc = {
      doc,
      updatedAt: Date.now(),
      createdAt: existing?.createdAt || Date.now(),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch (e) {
    console.error('Failed to save draft:', e);
  }
}

/**
 * Clear the draft.
 */
export function clearDraft(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(DRAFT_KEY);
}

/**
 * Check if a draft exists.
 */
export function hasDraft(): boolean {
  return getDraft() !== null;
}

// =============================================================================
// Migration from Legacy Storage
// =============================================================================

/**
 * One-time migration from legacy storage patterns.
 * Call this on app init.
 */
export function migrateLegacyDraft(): void {
  if (typeof window === 'undefined') return;
  
  try {
    // Check if we already have a draft in new format
    if (getDraft()) return;
    
    // Look for legacy draft data
    const allKeys = Object.keys(localStorage);
    
    for (const key of allKeys) {
      // Check for old draft pattern: mycorner:draft:{id}
      if (key.startsWith('mycorner:draft:')) {
        try {
          const data = localStorage.getItem(key);
          if (!data) continue;
          
          const parsed = JSON.parse(data);
          
          // Old format had: { id, title, blocks, background, createdAt, updatedAt }
          if (parsed.blocks && Array.isArray(parsed.blocks)) {
            // Convert to new PageDoc format
            const doc: PageDoc = {
              version: 1,
              title: parsed.title || undefined,
              bio: undefined,
              themeId: 'default',
              blocks: convertLegacyBlocks(parsed.blocks),
            };
            
            saveDraft(doc);
            console.log('[Draft] Migrated legacy draft from', key);
            
            // Clean up legacy key
            localStorage.removeItem(key);
            break;
          }
        } catch {
          // Continue to next key
        }
      }
    }
    
    // Clean up other legacy keys
    for (const key of allKeys) {
      for (const prefix of LEGACY_KEYS) {
        if (key.startsWith(prefix) || key === prefix.slice(0, -1)) {
          localStorage.removeItem(key);
        }
      }
    }
    
    // Also remove the old draft key pointer
    localStorage.removeItem('yourcorner:draft:v1'); // The old format stored draft ID here
    
  } catch (e) {
    console.error('Failed to migrate legacy draft:', e);
  }
}

/**
 * Convert legacy blocks format to new format.
 */
function convertLegacyBlocks(legacyBlocks: unknown[]): PageDoc['blocks'] {
  const blocks: PageDoc['blocks'] = [];
  
  for (const legacy of legacyBlocks) {
    if (!legacy || typeof legacy !== 'object') continue;
    
    const l = legacy as Record<string, unknown>;
    const id = String(l.id || `blk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    const x = Number(l.x) || 0;
    const y = Number(l.y) || 0;
    const width = Number(l.width) || 200;
    const height = Number(l.height) || 100;
    const rotation = l.rotation ? Number(l.rotation) : undefined;
    
    const type = String(l.type || 'TEXT').toLowerCase();
    const content = l.content as string || '';
    
    switch (type) {
      case 'text':
        blocks.push({
          id,
          type: 'text',
          x, y, width, height, rotation,
          content: { text: content },
        });
        break;
      case 'image':
        blocks.push({
          id,
          type: 'image',
          x, y, width, height, rotation,
          content: { url: content, alt: undefined },
        });
        break;
      case 'link': {
        // Use nullish coalescing (??) to preserve empty strings instead of || which treats '' as falsy
        let linkContent: { label: string; url: string };
        try {
          const parsed = JSON.parse(content);
          linkContent = {
            label: parsed.label ?? parsed.name ?? parsed.text ?? 'Link',
            url: parsed.url ?? '',
          };
        } catch {
          linkContent = { label: 'Link', url: content };
        }
        blocks.push({
          id,
          type: 'link',
          x, y, width, height, rotation,
          content: linkContent,
        });
        break;
      }
    }
  }
  
  return blocks;
}

// =============================================================================
// Legacy Compatibility Stubs (for gradual migration)
// =============================================================================

// These functions are no-ops to prevent import errors during migration.
// Remove once all usages are updated.

/** @deprecated Use getDraft() instead */
export function generateDraftId(): string {
  return 'draft-v1';
}

/** @deprecated No longer used */
export function deleteDraft(_draftId?: string): void {
  clearDraft();
}

/** @deprecated No longer used */
export function setActiveDraftId(_draftId: string): void {}

/** @deprecated No longer used */
export function clearActiveDraftId(): void {}

/** @deprecated No longer used */
export function getActiveDraftId(): string | null { return null; }

/** @deprecated No longer used */
export function setAuthContinuation(_continuation: unknown): void {}

/** @deprecated No longer used */
export function getAuthContinuation(): null { return null; }

/** @deprecated No longer used */
export function clearAuthContinuation(): void {}

/** @deprecated No longer used */
export function hasStarterBeenDismissed(_draftId: string): boolean { return false; }

/** @deprecated No longer used */
export function setStarterDismissed(_draftId: string): void {}

/** @deprecated No longer used */
export function setPublishToastData(_url: string): void {}

/** @deprecated No longer used */
export function getPublishToastData(): null { return null; }

/** @deprecated No longer used */
export function clearPublishToastData(): void {}

/** @deprecated No longer used */
export function clearAllDrafts(): void { clearDraft(); }

/** @deprecated No longer used */
export function getAllDraftIds(): string[] { return []; }

// =============================================================================
// Legacy Block/Background Types (for compatibility)
// =============================================================================

// These types match the old format for migration purposes
export interface Block {
  id: string;
  type: 'TEXT' | 'IMAGE' | 'LINK';
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  style?: Record<string, unknown>;
  effects?: Record<string, unknown>;
  rotation?: number;
}

export interface BackgroundConfig {
  mode: 'solid' | 'gradient';
  solid?: { color: string };
  gradient?: { type: 'linear' | 'radial'; colorA: string; colorB: string; angle: number };
}

export interface DraftData {
  id: string;
  title: string;
  blocks: Block[];
  background?: BackgroundConfig;
  createdAt: number;
  updatedAt: number;
}
