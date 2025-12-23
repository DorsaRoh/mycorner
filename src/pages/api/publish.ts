/**
 * POST /api/publish
 * 
 * Production publish endpoint that:
 * 1. Validates authenticated user
 * 2. Validates PageDoc with Zod
 * 3. Generates or reuses slug (NEVER based on username)
 * 4. Renders static HTML
 * 5. Uploads to object storage (MUST succeed before DB update)
 * 6. Upserts DB record
 * 7. Purges CDN cache
 * 8. Returns slug
 * 
 * PRODUCTION INVARIANTS:
 * - Storage must be configured (returns 503 if not)
 * - Upload must succeed before DB is updated
 * - Slug is based on userId, never username
 * - Conflict detection with one retry
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { PageDocSchema } from '@/lib/schema/page';
import { renderPageHtml } from '@/server/render/renderPageHtml';
import { 
  uploadPageHtml, 
  isUploadConfigured, 
  requirePublicPagesConfigured,
  isValidSlug,
  generateBaseSlug,
} from '@/server/storage/client';
import { purgePage, isPurgeConfigured } from '@/server/cdn/purge';
import type { PublishPageResult } from '@/server/db/types';
import { applyRateLimit, PUBLISH_LIMIT } from '@/server/rateLimit/index';

// =============================================================================
// Request Schema
// =============================================================================

const PublishRequestSchema = z.object({
  doc: PageDocSchema,
});

// =============================================================================
// Limits
// =============================================================================

const MAX_BLOCKS = 50;
const MAX_DOC_SIZE_BYTES = 500_000; // 500KB
const MAX_HTML_SIZE_BYTES = 1_000_000; // 1MB

// =============================================================================
// Slug Generation (userId-based, NEVER username)
// =============================================================================

/**
 * Ensure slug is unique by appending -2, -3, etc. if needed.
 */
async function ensureUniqueSlug(
  baseSlug: string,
  db: typeof import('@/server/db')
): Promise<string> {
  // Validate base slug
  if (!isValidSlug(baseSlug)) {
    throw new Error(`Invalid base slug: ${baseSlug}`);
  }
  
  // Check if base slug is available
  const existing = await db.getPageBySlug(baseSlug);
  if (!existing) return baseSlug;
  
  // Try numeric suffixes
  for (let i = 2; i <= 100; i++) {
    const candidate = `${baseSlug}-${i}`;
    if (candidate.length > 64) break; // Slug too long
    const exists = await db.getPageBySlug(candidate);
    if (!exists) return candidate;
  }
  
  // Fallback: append random string
  const random = Math.random().toString(36).slice(2, 8);
  return `${baseSlug}-${random}`;
}

// =============================================================================
// Logging
// =============================================================================

interface PublishLog {
  userId: string;
  slug: string;
  blocksCount: number;
  docSize: number;
  htmlSize: number;
  storageConfigured: boolean;
  cdnConfigured: boolean;
  latencyMs: number;
  success: boolean;
  error?: string;
}

function logPublish(log: PublishLog): void {
  const level = log.success ? 'info' : 'error';
  const msg = log.success 
    ? `[Publish] Success: ${log.slug} (${log.latencyMs}ms)`
    : `[Publish] Failed: ${log.slug} - ${log.error}`;
  
  console[level](msg, {
    ...log,
    timestamp: new Date().toISOString(),
  });
}

// =============================================================================
// API Handler
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const startTime = Date.now();
  
  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }
  
  // rate limiting
  if (!(await applyRateLimit(req, res, PUBLISH_LIMIT))) {
    return; // response already sent
  }
  
  // Get user from session cookie
  const { getUserFromRequest } = await import('@/server/auth/session');
  const user = await getUserFromRequest(req);
  if (!user?.id) {
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication required' 
    });
  }
  
  let slug = '';
  
  try {
    // === PRODUCTION GATE: Storage must be configured ===
    const configError = requirePublicPagesConfigured();
    if (configError) {
      console.error('[Publish] Storage not configured:', configError);
      return res.status(503).json({
        success: false,
        error: 'Service unavailable: storage not configured',
      });
    }
    
    // In production, we must have full upload credentials
    if (process.env.NODE_ENV === 'production' && !isUploadConfigured()) {
      console.error('[Publish] Upload credentials not configured in production');
      return res.status(503).json({
        success: false,
        error: 'Service unavailable: storage credentials not configured',
      });
    }
    
    // Parse request body
    const parseResult = PublishRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      return res.status(400).json({
        success: false,
        error: `Invalid request: ${firstError.path.join('.')}: ${firstError.message}`,
      });
    }
    
    const { doc } = parseResult.data;
    
    // Validate limits
    if (doc.blocks.length > MAX_BLOCKS) {
      return res.status(400).json({
        success: false,
        error: `Too many blocks (max ${MAX_BLOCKS})`,
      });
    }
    
    const docSize = JSON.stringify(doc).length;
    if (docSize > MAX_DOC_SIZE_BYTES) {
      return res.status(400).json({
        success: false,
        error: `Document too large (max ${MAX_DOC_SIZE_BYTES / 1000}KB)`,
      });
    }
    
    // Import database
    const db = await import('@/server/db');
    
    // Get or generate slug (NEVER based on username)
    const existingPages = await db.getPagesByUserId(user.id);
    let pageId: string | null = null;
    let baseServerRevision: number = 1;
    
    if (existingPages && existingPages.length > 0) {
      // User already has a page - reuse existing slug (immutable)
      const existingPage = existingPages[0];
      pageId = existingPage.id;
      baseServerRevision = existingPage.server_revision;
      
      // Reuse existing slug if valid, otherwise regenerate
      if (existingPage.slug && isValidSlug(existingPage.slug)) {
        slug = existingPage.slug;
      } else {
        // Existing page has no slug or invalid slug - generate one
        const baseSlug = generateBaseSlug(user.id);
        slug = await ensureUniqueSlug(baseSlug, db);
      }
    } else {
      // New user - generate unique slug based on userId (NEVER username)
      const baseSlug = generateBaseSlug(user.id);
      slug = await ensureUniqueSlug(baseSlug, db);
    }
    
    // Render static HTML
    const html = renderPageHtml(doc, {
      appOrigin: process.env.APP_ORIGIN || process.env.PUBLIC_URL,
    });
    
    const htmlSize = html.length;
    if (htmlSize > MAX_HTML_SIZE_BYTES) {
      return res.status(400).json({
        success: false,
        error: 'Rendered page too large',
      });
    }
    
    // === CRITICAL: Upload to storage BEFORE DB update ===
    // If upload fails, we do NOT update DB - prevents "DB says published but artifact missing"
    let storageKey: string | null = null;
    
    if (isUploadConfigured()) {
      try {
        const uploadResult = await uploadPageHtml(slug, html);
        storageKey = uploadResult.key;
      } catch (uploadError) {
        const errorMsg = uploadError instanceof Error ? uploadError.message : 'Unknown upload error';
        console.error('[Publish] Storage upload failed:', errorMsg);
        
        logPublish({
          userId: user.id,
          slug,
          blocksCount: doc.blocks.length,
          docSize,
          htmlSize,
          storageConfigured: true,
          cdnConfigured: isPurgeConfigured(),
          latencyMs: Date.now() - startTime,
          success: false,
          error: `Storage upload failed: ${errorMsg}`,
        });
        
        return res.status(500).json({
          success: false,
          error: 'Failed to upload page to storage',
        });
      }
    } else if (process.env.NODE_ENV !== 'development') {
      // In non-development, upload must be configured
      return res.status(503).json({
        success: false,
        error: 'Service unavailable: storage not configured',
      });
    }
    
    // === DB Update with conflict retry ===
    const publishWithRetry = async (): Promise<PublishPageResult> => {
      // Create page if needed
      if (!pageId) {
        const page = await db.createPage(user.id, doc.title, user.id);
        if (!page) {
          throw new Error('Failed to create page in database');
        }
        pageId = page.id;
        baseServerRevision = page.server_revision;
      }
      
      // First attempt
      const result = await db.publishPage({
        id: pageId,
        content: JSON.stringify(doc),
        baseServerRevision,
        slug,
      });
      
      // If conflict, retry once with fresh revision
      if (result.conflict) {
        const freshPage = await db.getPageById(pageId);
        if (!freshPage) {
          throw new Error('Page not found during retry');
        }
        
        const retryResult = await db.publishPage({
          id: pageId,
          content: JSON.stringify(doc),
          baseServerRevision: freshPage.server_revision,
          slug,
        });
        
        return retryResult;
      }
      
      return result;
    };
    
    const publishResult = await publishWithRetry();
    
    if (publishResult.conflict) {
      // Still conflicting after retry - inform client
      return res.status(409).json({
        success: false,
        error: 'Publish conflict, please retry',
      });
    }
    
    if (!publishResult.page) {
      throw new Error('Publish failed: page not found');
    }
    
    // === Purge CDN cache ===
    let purgeWarnings: string[] = [];
    if (isPurgeConfigured()) {
      try {
        const purgeResult = await purgePage(slug);
        if (purgeResult.warnings && purgeResult.warnings.length > 0) {
          purgeWarnings = purgeResult.warnings;
        }
      } catch (purgeError) {
        // log but don't fail publish - content is live, just cached
        console.warn('[publish] cdn purge failed:', purgeError);
      }
    }
    
    // log success
    logPublish({
      userId: user.id,
      slug,
      blocksCount: doc.blocks.length,
      docSize,
      htmlSize,
      storageConfigured: isUploadConfigured(),
      cdnConfigured: isPurgeConfigured(),
      latencyMs: Date.now() - startTime,
      success: true,
    });
    
    // include warnings in response if any
    const response: Record<string, unknown> = {
      success: true,
      slug,
      storageKey,
    };
    
    if (purgeWarnings.length > 0) {
      response.warnings = purgeWarnings;
    }
    
    return res.status(200).json(response);
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    
    logPublish({
      userId: user.id,
      slug: slug || 'unknown',
      blocksCount: 0,
      docSize: 0,
      htmlSize: 0,
      storageConfigured: isUploadConfigured(),
      cdnConfigured: isPurgeConfigured(),
      latencyMs: Date.now() - startTime,
      success: false,
      error: errorMsg,
    });
    
    console.error('[Publish] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}
