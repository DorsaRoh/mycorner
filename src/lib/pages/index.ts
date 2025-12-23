/**
 * Canonical fetch functions for pages.
 * 
 * ARCHITECTURE:
 * - getPublishedPageBySlug: Public, cacheable, for /{slug} ISR route
 * - getDraftPageForUser: Private, no-cache, for editor/account routes
 * 
 * These are the SINGLE SOURCE OF TRUTH for page data access.
 * No ad-hoc queries elsewhere in the codebase.
 */

import type { PageDoc } from '@/lib/schema/page';
import { PageDocSchema, convertLegacyPage } from '@/lib/schema/page';

// =============================================================================
// Types
// =============================================================================

export interface PublishedPageData {
  slug: string;
  doc: PageDoc;
  publishedAt: string | null;
  ownerUsername: string | null;
}

export interface DraftPageData {
  pageId: string;
  slug: string | null;
  doc: PageDoc;
  isPublished: boolean;
  serverRevision: number;
  updatedAt: string;
}

// =============================================================================
// Public Page Fetch (for ISR routes)
// =============================================================================

/**
 * Get published page by slug for public viewing.
 * 
 * This function is used by getStaticProps in /[slug].tsx.
 * Returns null if page doesn't exist or isn't published.
 * 
 * IMPORTANT: This must work WITHOUT authentication.
 */
export async function getPublishedPageBySlug(slug: string): Promise<PublishedPageData | null> {
  const normalizedSlug = slug.toLowerCase();
  
  // Import database module dynamically (avoids client bundling)
  const db = await import('@/server/db');
  
  // First, try to find page by slug directly
  let page = await db.getPageBySlug(normalizedSlug);
  let ownerUsername: string | null = null;
  
  // If not found by slug, try finding by username
  if (!page) {
    const user = await db.getUserByUsername(normalizedSlug);
    if (user) {
      ownerUsername = user.username;
      const pages = await db.getPagesByUserId(user.id);
      // Find the published page for this user
      page = pages.find(p => p.is_published) || null;
    }
  }
  
  // Not found or not published
  if (!page || !page.is_published) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[getPublishedPageBySlug] Page not found or not published: ${normalizedSlug}`);
    }
    return null;
  }
  
  // Get owner username if not already fetched
  if (!ownerUsername && page.user_id) {
    const owner = await db.getUserById(page.user_id);
    ownerUsername = owner?.username || null;
  }
  
  // Parse published content
  const doc = parsePageContent(page.published_content || page.content, page);
  
  if (!doc) {
    console.error(`[getPublishedPageBySlug] Failed to parse content for slug: ${normalizedSlug}`);
    return null;
  }
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`[getPublishedPageBySlug] Success: ${normalizedSlug}, blocks: ${doc.blocks.length}`);
  }
  
  return {
    slug: normalizedSlug,
    doc,
    publishedAt: page.published_at || null,
    ownerUsername,
  };
}

// =============================================================================
// Draft Page Fetch (for authenticated editor routes)
// =============================================================================

/**
 * Get draft page for authenticated user.
 * 
 * This function is used by editor routes (/edit, /new, etc).
 * Returns the DRAFT content, not the published content.
 * 
 * IMPORTANT: This requires authentication. Never use for public routes.
 */
export async function getDraftPageForUser(userId: string): Promise<DraftPageData | null> {
  const db = await import('@/server/db');
  
  const pages = await db.getPagesByUserId(userId);
  
  if (!pages || pages.length === 0) {
    return null;
  }
  
  // Get the user's primary page (first one, should only have one in MVP)
  const page = pages[0];
  
  // Parse DRAFT content (not published_content)
  const doc = parsePageContent(page.content, page);
  
  if (!doc) {
    console.error(`[getDraftPageForUser] Failed to parse content for user: ${userId}`);
    return null;
  }
  
  return {
    pageId: page.id,
    slug: page.slug,
    doc,
    isPublished: !!page.is_published,
    serverRevision: page.server_revision,
    updatedAt: page.updated_at,
  };
}

// =============================================================================
// Helper: Parse Page Content
// =============================================================================

interface DbPageLike {
  title?: string | null;
  published_background?: string | null;
  background?: string | null;
}

/**
 * Parse raw page content (string or object) into PageDoc format.
 * Handles both new PageDoc format and legacy blocks array format.
 */
function parsePageContent(rawContent: string | unknown, page: DbPageLike): PageDoc | null {
  try {
    // Parse if it's a string
    const content = typeof rawContent === 'string' 
      ? JSON.parse(rawContent) 
      : rawContent;
    
    // Try to parse as PageDoc (new format)
    const parsed = PageDocSchema.safeParse(content);
    if (parsed.success) {
      return parsed.data;
    }
    
    // Legacy format - array of blocks
    if (Array.isArray(content)) {
      const backgroundRaw = parseBackground(page.published_background || page.background);
      // Cast to expected shape - the function will handle validation
      const background = backgroundRaw as {
        mode: string;
        solid?: { color: string };
        gradient?: { type: string; colorA: string; colorB: string; angle: number };
        image?: { url: string; fit: string; position: string; opacity: number };
      } | undefined;
      
      return convertLegacyPage({
        title: page.title || undefined,
        blocks: content,
        background,
      });
    }
    
    // Unknown format
    console.error('[parsePageContent] Unknown content format:', typeof content);
    return null;
    
  } catch (error) {
    console.error('[parsePageContent] Parse error:', error);
    return null;
  }
}

/**
 * Parse background config from raw database value.
 */
function parseBackground(raw: string | unknown): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // Ensure we return a proper Record type
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// =============================================================================
// Slug Validation
// =============================================================================

/**
 * Check if a slug is valid format.
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9_-]{1,64}$/.test(slug);
}

/**
 * Check if a slug is available (not taken by another user).
 */
export async function isSlugAvailable(slug: string, excludeUserId?: string): Promise<boolean> {
  const db = await import('@/server/db');
  
  // Check username
  const user = await db.getUserByUsername(slug.toLowerCase());
  if (user && user.id !== excludeUserId) {
    return false;
  }
  
  // Check page slug
  const page = await db.getPageBySlug(slug.toLowerCase());
  if (page && page.user_id !== excludeUserId) {
    return false;
  }
  
  return true;
}

