/**
 * POST /api/save-anonymous-draft
 * 
 * Saves the current draft content to the server as an anonymous page.
 * Called before showing the auth gate so the user's work is preserved
 * even if localStorage is cleared during the OAuth flow.
 * 
 * After authentication, the auth callback will claim this page via
 * claimAnonymousPages() using the draft_owner_token cookie.
 * 
 * ISOLATION: Each browser session gets a unique UUID-based token (anon_<uuid>).
 * Two concurrent users will have different tokens and thus different pages.
 * 
 * CLEANUP: Stale anonymous pages (unclaimed for 1+ hour) are deleted
 * opportunistically on ~5% of requests.
 * 
 * Body: { doc: PageDoc }
 * Returns: { success: true, pageId: string }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { PageDocSchema } from '@/lib/schema/page';
import { 
  getDraftOwnerToken, 
  buildDraftOwnerTokenCookie 
} from '@/server/auth/session';
import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// Configuration
// =============================================================================

/** How long to keep unclaimed anonymous pages before deletion (in minutes) */
const STALE_PAGE_AGE_MINUTES = 60;

/** Probability of running cleanup on each request (0-1) */
const CLEANUP_PROBABILITY = 0.05; // 5% of requests

// =============================================================================
// Request Schema
// =============================================================================

const SaveDraftRequestSchema = z.object({
  doc: PageDocSchema,
});

// =============================================================================
// API Handler
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Parse request body
    const parseResult = SaveDraftRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      return res.status(400).json({
        success: false,
        error: `Invalid request: ${firstError.path.join('.')}: ${firstError.message}`,
      });
    }

    const { doc } = parseResult.data;

    // Get or create draft owner token
    // Each browser session gets its own unique token for isolation
    let draftToken = await getDraftOwnerToken(req, res);
    
    if (!draftToken) {
      // Generate a new cryptographically unique token
      // Format: anon_<uuid> - the anon_ prefix allows cleanup queries to identify anonymous pages
      draftToken = `anon_${uuidv4()}`;
      // Set the cookie so it persists through OAuth flow
      res.setHeader('Set-Cookie', buildDraftOwnerTokenCookie(draftToken));
    }
    
    // Ensure the token has the anon_ prefix for consistency
    // (handles legacy tokens that might not have the prefix)
    if (!draftToken.startsWith('anon_')) {
      draftToken = `anon_${draftToken}`;
      res.setHeader('Set-Cookie', buildDraftOwnerTokenCookie(draftToken));
    }

    // Import database
    const db = await import('@/server/db');

    // Opportunistic cleanup: run on ~5% of requests to avoid overhead
    // This keeps the database clean without needing a separate cron job
    if (Math.random() < CLEANUP_PROBABILITY) {
      try {
        await db.deleteStaleAnonymousPages(STALE_PAGE_AGE_MINUTES);
      } catch (cleanupError) {
        // Non-fatal - log and continue
        console.warn('[save-anonymous-draft] Cleanup failed:', cleanupError);
      }
    }

    // Check if user already has an anonymous page with this token
    // This ensures each token maps to at most one page
    const existingPages = await db.getPagesByOwnerId(draftToken);
    let pageId: string;

    if (existingPages && existingPages.length > 0) {
      // Update the existing page (same user, same session)
      const existingPage = existingPages[0];
      pageId = existingPage.id;
      
      await db.updatePage(pageId, {
        title: doc.title || undefined,
        content: JSON.stringify(doc),
        background: doc.background ? JSON.stringify(doc.background) : undefined,
      });
      
      console.log('[save-anonymous-draft] Updated existing anonymous page:', pageId, 'token:', draftToken.substring(0, 20) + '...');
    } else {
      // Create a new anonymous page for this token
      const page = await db.createPage(draftToken, doc.title || undefined);
      pageId = page.id;
      
      // Update with full content
      await db.updatePage(pageId, {
        content: JSON.stringify(doc),
        background: doc.background ? JSON.stringify(doc.background) : undefined,
      });
      
      console.log('[save-anonymous-draft] Created new anonymous page:', pageId, 'token:', draftToken.substring(0, 20) + '...');
    }

    return res.status(200).json({
      success: true,
      pageId,
    });

  } catch (error) {
    console.error('[save-anonymous-draft] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}

