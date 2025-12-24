/**
 * Server-side page helpers - Single source of truth for page operations.
 * 
 * This module provides the canonical functions for:
 * - Creating draft pages (for authenticated and anonymous users)
 * - Resolving a user's primary page
 * - Getting a page for editing with ownership checks
 * - Anonymous draft claiming on auth
 */

import type { DbPage } from './db/types';
import { createStarterBlocks, DEFAULT_STARTER_BACKGROUND } from '@/lib/starter';
import { legacyBlocksToPageDoc } from '@/lib/draft';
import type { PageDoc } from '@/lib/schema/page';

// =============================================================================
// Types
// =============================================================================

export interface CreateDraftPageParams {
  /** User ID if authenticated */
  userId?: string | null;
  /** Anonymous token from cookie if not authenticated */
  anonToken?: string | null;
}

export interface CreateDraftPageResult {
  pageId: string;
  isNew: boolean;
}

export interface GetPageForEditParams {
  pageId: string;
  /** User ID if authenticated */
  userId?: string | null;
  /** Anonymous token from cookie for guest edit */
  anonToken?: string | null;
}

export interface PageForEdit {
  page: DbPage;
  blocks: unknown[];
  background: unknown;
  title: string | null;
  isOwner: boolean;
}

// =============================================================================
// Create Draft Page
// =============================================================================

/**
 * Creates a new draft page or returns an existing one.
 * 
 * For authenticated users:
 *   - If user already has a page, return the most recent one
 *   - Otherwise, create a new page with starter content
 * 
 * For anonymous users:
 *   - Create a page with owner_id = anonToken
 *   - This allows claiming later via claimAnonymousPages()
 */
export async function createDraftPage(params: CreateDraftPageParams): Promise<CreateDraftPageResult> {
  const { userId, anonToken } = params;
  const db = await import('./db');
  
  // For authenticated users, check if they already have a page
  if (userId) {
    const existingPages = await db.getPagesByUserId(userId);
    if (existingPages && existingPages.length > 0) {
      // Return most recently updated page
      const sorted = existingPages.sort((a, b) => {
        const dateA = new Date(a.updated_at).getTime();
        const dateB = new Date(b.updated_at).getTime();
        return dateB - dateA;
      });
      return { pageId: sorted[0].id, isNew: false };
    }
  }
  
  // For anonymous users, check for existing draft with this token
  if (anonToken && !userId) {
    const existingPages = await db.getPagesByOwnerId(anonToken);
    if (existingPages && existingPages.length > 0) {
      // Return most recently updated unpublished draft
      const drafts = existingPages.filter(p => !p.is_published);
      if (drafts.length > 0) {
        const sorted = drafts.sort((a, b) => {
          const dateA = new Date(a.updated_at).getTime();
          const dateB = new Date(b.updated_at).getTime();
          return dateB - dateA;
        });
        return { pageId: sorted[0].id, isNew: false };
      }
    }
  }
  
  // Create new page with starter content
  const ownerId = userId || anonToken;
  if (!ownerId) {
    throw new Error('Either userId or anonToken is required to create a page');
  }
  
  // Generate starter content
  const starterBlocks = createStarterBlocks(false); // Desktop layout for initial creation
  const pageDocBlocks = legacyBlocksToPageDoc(starterBlocks);
  const pageDoc: PageDoc = {
    version: 1,
    title: undefined,
    bio: undefined,
    themeId: 'default',
    background: DEFAULT_STARTER_BACKGROUND,
    blocks: pageDocBlocks,
  };
  
  const page = await db.createPage(ownerId, undefined, userId || undefined);
  
  // Update with starter content
  await db.updatePage(page.id, {
    content: JSON.stringify(pageDoc),
    background: JSON.stringify(DEFAULT_STARTER_BACKGROUND),
  });
  
  return { pageId: page.id, isNew: true };
}

// =============================================================================
// Get User's Primary Page ID
// =============================================================================

/**
 * Get the page ID that a logged-in user should land on.
 * 
 * Priority:
 * 1. Most recently updated draft (unpublished)
 * 2. Most recently published page
 * 3. null if no pages exist
 */
export async function getUserPrimaryPageId(userId: string): Promise<string | null> {
  const db = await import('./db');
  
  const pages = await db.getPagesByUserId(userId);
  if (!pages || pages.length === 0) {
    return null;
  }
  
  // Sort by updated_at descending
  const sorted = pages.sort((a, b) => {
    const dateA = new Date(a.updated_at).getTime();
    const dateB = new Date(b.updated_at).getTime();
    return dateB - dateA;
  });
  
  return sorted[0].id;
}

// =============================================================================
// Get Page for Edit
// =============================================================================

/**
 * Get a page for editing with ownership verification.
 * 
 * Returns the page if:
 * - User is authenticated and owns the page (user_id matches)
 * - User is anonymous and anonToken matches owner_id
 * 
 * Returns null if page doesn't exist or user doesn't have access.
 */
export async function getPageForEdit(params: GetPageForEditParams): Promise<PageForEdit | null> {
  const { pageId, userId, anonToken } = params;
  const db = await import('./db');
  
  const page = await db.getPageById(pageId);
  if (!page) {
    return null;
  }
  
  // Check ownership
  let isOwner = false;
  
  if (userId) {
    // Authenticated user - check user_id
    isOwner = page.user_id === userId;
  } else if (anonToken) {
    // Anonymous user - check owner_id matches and page is not claimed
    isOwner = page.owner_id === anonToken && !page.user_id;
  }
  
  if (!isOwner) {
    return null;
  }
  
  // Parse content
  let blocks: unknown[] = [];
  let background: unknown = undefined;
  
  try {
    const content = JSON.parse(page.content || '[]');
    
    // Handle PageDoc format vs legacy array format
    if (Array.isArray(content)) {
      blocks = content;
    } else if (content && typeof content === 'object' && Array.isArray(content.blocks)) {
      // PageDoc format - import conversion function
      const { pageDocBlocksToLegacy } = await import('@/lib/draft');
      blocks = pageDocBlocksToLegacy(content.blocks);
      background = content.background;
    }
  } catch (e) {
    console.error('[getPageForEdit] Failed to parse content:', e);
  }
  
  // Parse background from page if not in content
  if (!background && page.background) {
    try {
      background = JSON.parse(page.background);
    } catch (e) {
      console.error('[getPageForEdit] Failed to parse background:', e);
    }
  }
  
  return {
    page,
    blocks,
    background,
    title: page.title,
    isOwner,
  };
}

// =============================================================================
// Claim Anonymous Pages
// =============================================================================

/**
 * Claim all anonymous pages when user authenticates.
 * Called after OAuth callback when we have both anonToken and userId.
 */
export async function claimAnonymousPages(anonToken: string, userId: string): Promise<void> {
  const db = await import('./db');
  await db.claimAnonymousPages(anonToken, userId);
}

// =============================================================================
// Check if User Has Any Page
// =============================================================================

/**
 * Quick check if user has any pages (for redirect logic).
 */
export async function userHasPage(userId: string): Promise<boolean> {
  const db = await import('./db');
  const pages = await db.getPagesByUserId(userId);
  return pages && pages.length > 0;
}

