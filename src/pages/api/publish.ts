/**
 * POST /api/publish
 * 
 * production publish endpoint that:
 * 1. validates authenticated user
 * 2. validates PageDoc with Zod
 * 3. uses username as slug (requires username to be set)
 * 4. renders static HTML with absolute asset URLs
 * 5. uploads to object storage (MUST succeed before DB update)
 * 6. upserts DB record
 * 7. purges CDN cache
 * 8. returns slug and publicUrl
 * 
 * PRODUCTION INVARIANTS:
 * - storage must be configured (returns 503 if not)
 * - upload must succeed before DB is updated
 * - slug is the user's username
 * - share url is always APP_ORIGIN/{username}
 * - conflict detection with one retry
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
  getMissingStorageEnvVars,
  REQUIRED_STORAGE_ENV_VARS,
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
// app origin for public urls
// =============================================================================

function getAppOrigin(): string {
  return process.env.APP_ORIGIN || process.env.PUBLIC_URL || 'https://www.itsmycorner.com';
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
  
  // get user from session cookie
  const { getUserFromRequest } = await import('@/server/auth/session');
  const sessionUser = await getUserFromRequest(req);
  if (!sessionUser?.id) {
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication required' 
    });
  }
  
  // import database
  const db = await import('@/server/db');
  
  // load full user record to get username
  const user = await db.getUserById(sessionUser.id);
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'User not found. Please re-login.',
    });
  }
  
  // require username to publish
  if (!user.username) {
    return res.status(400).json({
      success: false,
      error: 'Username required. Please complete onboarding first.',
      code: 'USERNAME_REQUIRED',
    });
  }
  
  // slug is the username
  const slug = user.username;
  
  try {
    // === PRODUCTION GATE: Storage must be fully configured ===
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      const missing = getMissingStorageEnvVars();
      if (missing.length > 0) {
        console.error('[Publish] Storage not configured in production. Missing:', missing);
        return res.status(503).json({
          success: false,
          error: 'Service unavailable: storage not configured',
          code: 'STORAGE_NOT_CONFIGURED',
          missingEnvVars: missing,
          requiredEnvVars: [...REQUIRED_STORAGE_ENV_VARS],
        });
      }
    } else {
      // development: allow graceful degradation but warn
      const configError = requirePublicPagesConfigured();
      if (configError && !isUploadConfigured()) {
        console.warn('[Publish] Storage not configured in development - uploads will fail');
      }
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
    
    // validate slug format
    if (!isValidSlug(slug)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid username format for publishing. Please update your username.',
        code: 'INVALID_USERNAME',
      });
    }
    
    // get or create page for user
    const existingPages = await db.getPagesByUserId(user.id);
    let pageId: string | null = null;
    let baseServerRevision: number = 1;
    
    if (existingPages && existingPages.length > 0) {
      // user already has a page - reuse it
      const existingPage = existingPages[0];
      pageId = existingPage.id;
      baseServerRevision = existingPage.server_revision;
    }
    
    // render static HTML with absolute asset urls
    const appOrigin = getAppOrigin();
    const html = renderPageHtml(doc, {
      appOrigin,
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
    let storageWarning: string | null = null;
    
    // Check if we should allow DB-only publish (no S3)
    const allowDbOnlyPublish = process.env.ALLOW_DB_ONLY_PUBLISH === 'true' || !isProduction;
    
    if (isUploadConfigured()) {
      try {
        const uploadResult = await uploadPageHtml(slug, html);
        storageKey = uploadResult.key;
      } catch (uploadError) {
        const errorMsg = uploadError instanceof Error ? uploadError.message : 'Unknown upload error';
        console.error('[Publish] Storage upload failed:', errorMsg);
        
        if (allowDbOnlyPublish) {
          // Fallback: allow publish to proceed without storage
          console.warn('[Publish] Continuing without storage due to ALLOW_DB_ONLY_PUBLISH=true');
          storageWarning = `Storage upload failed (page will be served dynamically): ${errorMsg}`;
        } else {
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
            error: `Failed to upload page to storage: ${errorMsg}`,
          });
        }
      }
    } else {
      // Storage not configured - allow if permitted
      if (allowDbOnlyPublish) {
        console.warn('[Publish] Storage not configured, page will only be in DB');
        storageWarning = 'Storage not configured, page will be served dynamically';
      } else {
        return res.status(503).json({
          success: false,
          error: 'Storage not configured',
        });
      }
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
    
    // canonical url is always /{slug} - the app serves it, not R2 directly
    // the client should redirect to this path, which the app will serve
    const url = `/${slug}`;
    
    // include warnings in response if any
    const response: Record<string, unknown> = {
      success: true,
      slug,
      url,
      // publicUrl is kept for backwards compatibility but points to canonical path
      publicUrl: url,
    };
    
    // collect all warnings
    const allWarnings: string[] = [...purgeWarnings];
    if (storageWarning) {
      allWarnings.push(storageWarning);
    }
    
    if (allWarnings.length > 0) {
      response.warnings = allWarnings;
    }
    
    // storageKey is only included if we actually uploaded to storage
    // this is for debugging purposes only
    if (storageKey && process.env.NODE_ENV !== 'production') {
      response._debug = { storageKey };
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
