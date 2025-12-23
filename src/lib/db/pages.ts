/**
 * Simplified data access layer for pages.
 * 
 * This module provides a clean API for page operations:
 * - getPublishedPageBySlug(slug) - for public viewing
 * - getMyPage(userId) - for authenticated editing
 * - upsertMyPage(userId, doc) - for publishing
 * 
 * Works with existing database schema while using new PageDoc format.
 */

import type { PageDoc, Block } from '../schema/page';
import { validatePageDoc, createEmptyPageDoc, convertLegacyPage } from '../schema/page';

// =============================================================================
// Types
// =============================================================================

export interface PublishedPage {
  slug: string;
  ownerUsername: string;
  doc: PageDoc;
  publishedAt: string;
}

export interface MyPage {
  id: string;
  slug: string | null;
  isPublished: boolean;
  doc: PageDoc;
  updatedAt: string;
}

export interface UpsertResult {
  success: boolean;
  slug: string;
  error?: string;
}

// =============================================================================
// Server-side Database Access
// =============================================================================

/**
 * Get a published page by its slug (username).
 * Used for public page viewing at /u/[slug].
 */
export async function getPublishedPageBySlug(slug: string): Promise<PublishedPage | null> {
  // Import dynamically to avoid client-side bundling
  const db = await import('@/server/db');
  
  // Get user by username (slug = username in our simplified model)
  const user = await db.getUserByUsername(slug.toLowerCase());
  if (!user) return null;
  
  // Get user's pages and find published one
  const pages = await db.getPagesByUserId(user.id);
  const publishedPage = pages.find(p => p.is_published);
  if (!publishedPage) return null;
  
  // Convert legacy format to PageDoc
  const doc = convertLegacyDbPage(publishedPage);
  
  return {
    slug: slug.toLowerCase(),
    ownerUsername: user.username || slug,
    doc,
    publishedAt: publishedPage.published_at || publishedPage.updated_at,
  };
}

/**
 * Get current user's page for editing.
 * Returns null if user has no page yet.
 */
export async function getMyPage(userId: string): Promise<MyPage | null> {
  const db = await import('@/server/db');
  
  const pages = await db.getPagesByUserId(userId);
  if (!pages || pages.length === 0) return null;
  
  // Get the most recent page (user should only have one in MVP)
  const page = pages[0];
  
  // Convert legacy format to PageDoc
  const doc = convertLegacyDbPage(page);
  
  return {
    id: page.id,
    slug: page.slug,
    isPublished: !!page.is_published,
    doc,
    updatedAt: page.updated_at,
  };
}

/**
 * Upsert (create or update) user's page.
 * This is the main publish function.
 * 
 * @param userId - The authenticated user's ID
 * @param doc - The PageDoc to save
 * @param username - User's username for slug generation
 */
export async function upsertMyPage(
  userId: string, 
  doc: PageDoc,
  username: string
): Promise<UpsertResult> {
  // Validate the doc
  const validation = validatePageDoc(doc);
  if (!validation.success) {
    return { success: false, slug: '', error: validation.error };
  }
  
  const db = await import('@/server/db');
  
  // Generate slug from username
  const slug = username.toLowerCase();
  
  // Check if user already has a page
  const existingPages = await db.getPagesByUserId(userId);
  
  // Convert PageDoc to legacy format for database storage
  const legacyBlocks = convertToLegacyBlocks(doc.blocks);
  const legacyBackground = { mode: 'solid' as const, solid: { color: '#ffffff' } };
  
  if (existingPages && existingPages.length > 0) {
    // Update existing page
    const pageId = existingPages[0].id;
    
    // Update content
    await db.updatePage(pageId, {
      title: doc.title,
      content: JSON.stringify(legacyBlocks),
      background: JSON.stringify(legacyBackground),
    });
    
    // Publish with content snapshot
    const result = await db.publishPage({
      id: pageId,
      content: JSON.stringify(legacyBlocks),
      background: JSON.stringify(legacyBackground),
      baseServerRevision: existingPages[0].server_revision,
      slug,
    });
    
    if (result.conflict) {
      return { success: false, slug: '', error: 'Conflict detected, please try again' };
    }
    
    return { success: true, slug };
  } else {
    // Create new page
    const page = await db.createPage(userId, doc.title, userId);
    if (!page) {
      return { success: false, slug: '', error: 'Failed to create page' };
    }
    
    // Update with content
    await db.updatePage(page.id, {
      title: doc.title,
      content: JSON.stringify(legacyBlocks),
      background: JSON.stringify(legacyBackground),
    });
    
    // Publish
    const result = await db.publishPage({
      id: page.id,
      content: JSON.stringify(legacyBlocks),
      background: JSON.stringify(legacyBackground),
      baseServerRevision: 1,
      slug,
    });
    
    if (!result.page) {
      return { success: false, slug: '', error: 'Failed to publish page' };
    }
    
    return { success: true, slug };
  }
}

// =============================================================================
// Slug Generation
// =============================================================================

/**
 * Generate a unique slug for a user.
 * Tries username first, then falls back to user-{id prefix}.
 */
export function generateSlug(userId: string, username?: string): string {
  if (username) {
    return username.toLowerCase();
  }
  return `user-${userId.slice(0, 8)}`;
}

/**
 * Check if a slug is available.
 */
export async function isSlugAvailable(slug: string, excludeUserId?: string): Promise<boolean> {
  const db = await import('@/server/db');
  
  // Check if username is taken
  const user = await db.getUserByUsername(slug.toLowerCase());
  if (user && user.id !== excludeUserId) {
    return false;
  }
  
  // Check if page slug is taken
  const page = await db.getPageBySlug(slug.toLowerCase());
  if (page && page.user_id !== excludeUserId) {
    return false;
  }
  
  return true;
}

// =============================================================================
// Conversion Helpers
// =============================================================================

/**
 * Convert database page format to PageDoc.
 */
function convertLegacyDbPage(dbPage: {
  id: string;
  title?: string | null;
  content: string;
  published_content?: string | null;
  background?: string | null;
  published_background?: string | null;
  is_published: number | boolean;
}): PageDoc {
  // Use published content if available, otherwise use draft content
  const contentJson = dbPage.is_published && dbPage.published_content 
    ? dbPage.published_content 
    : dbPage.content;
  
  const backgroundJson = dbPage.is_published && dbPage.published_background
    ? dbPage.published_background
    : dbPage.background;
  
  let blocks: Array<{
    id: string;
    type: 'TEXT' | 'IMAGE' | 'LINK';
    x: number;
    y: number;
    width: number;
    height: number;
    content: string;
    style?: Record<string, unknown>;
    rotation?: number;
  }> = [];
  
  let background: {
    mode: string;
    solid?: { color: string };
    gradient?: { type: string; colorA: string; colorB: string; angle: number };
  } | undefined;
  
  try {
    blocks = JSON.parse(contentJson || '[]');
  } catch {
    blocks = [];
  }
  
  try {
    background = backgroundJson ? JSON.parse(backgroundJson) : undefined;
  } catch {
    background = undefined;
  }
  
  return convertLegacyPage({
    title: dbPage.title || undefined,
    blocks,
    background,
  });
}

/**
 * Convert PageDoc blocks to legacy format for database storage.
 */
function convertToLegacyBlocks(blocks: Block[]): Array<{
  id: string;
  type: 'TEXT' | 'IMAGE' | 'LINK';
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  style?: Record<string, unknown>;
  rotation?: number;
}> {
  return blocks.map(block => {
    let content: string;
    let type: 'TEXT' | 'IMAGE' | 'LINK';
    
    switch (block.type) {
      case 'text':
        type = 'TEXT';
        content = block.content.text;
        break;
      case 'image':
        type = 'IMAGE';
        content = block.content.url;
        break;
      case 'link':
        type = 'LINK';
        content = JSON.stringify(block.content);
        break;
    }
    
    // Convert style back to legacy format
    const style: Record<string, unknown> = {};
    if (block.style) {
      if (block.style.align) style.textAlign = block.style.align;
      if (block.style.radius) {
        const radiusMap = { none: 0, sm: 0.15, md: 0.35, lg: 0.6, full: 1 };
        style.borderRadius = radiusMap[block.style.radius] || 0;
      }
      if (block.style.shadow) {
        const shadowMap = { none: 0, sm: 0.2, md: 0.5, lg: 0.8 };
        style.shadowStrength = shadowMap[block.style.shadow] || 0;
      }
    }
    
    return {
      id: block.id,
      type,
      x: block.x,
      y: block.y,
      width: block.width,
      height: block.height,
      content,
      style: Object.keys(style).length > 0 ? style : undefined,
      rotation: block.rotation,
    };
  });
}

