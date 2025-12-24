/**
 * POST /api/cleanup-anonymous-pages
 * 
 * Deletes stale unclaimed anonymous pages that are older than 1 hour.
 * 
 * This endpoint can be called:
 * - Via cron job (recommended for production)
 * - Manually for maintenance
 * 
 * Authentication: Requires a secret token to prevent abuse.
 * Set CLEANUP_SECRET in environment variables.
 * 
 * Request:
 * - POST with header: Authorization: Bearer <CLEANUP_SECRET>
 * - Optional body: { maxAgeMinutes: number } (default: 60)
 * 
 * Response:
 * - { success: true, deleted: number, remaining: number }
 */

import type { NextApiRequest, NextApiResponse } from 'next';

// =============================================================================
// Configuration
// =============================================================================

/** Default max age for stale pages (in minutes) */
const DEFAULT_MAX_AGE_MINUTES = 60;

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
    // Verify authorization
    const authHeader = req.headers.authorization;
    const cleanupSecret = process.env.CLEANUP_SECRET;
    
    // In production, require the secret
    if (process.env.NODE_ENV === 'production') {
      if (!cleanupSecret) {
        console.error('[cleanup] CLEANUP_SECRET not configured');
        return res.status(503).json({ 
          success: false, 
          error: 'Cleanup not configured' 
        });
      }
      
      if (!authHeader || authHeader !== `Bearer ${cleanupSecret}`) {
        return res.status(401).json({ 
          success: false, 
          error: 'Unauthorized' 
        });
      }
    }

    // Parse optional maxAgeMinutes from body
    const maxAgeMinutes = req.body?.maxAgeMinutes ?? DEFAULT_MAX_AGE_MINUTES;
    
    if (typeof maxAgeMinutes !== 'number' || maxAgeMinutes < 1) {
      return res.status(400).json({
        success: false,
        error: 'maxAgeMinutes must be a positive number',
      });
    }

    // Import database
    const db = await import('@/server/db');

    // Count before delete (for logging)
    const countBefore = await db.countStaleAnonymousPages(maxAgeMinutes);

    // Delete stale pages
    const deleted = await db.deleteStaleAnonymousPages(maxAgeMinutes);

    // Count remaining stale pages (should be 0 if all deleted)
    const remaining = await db.countStaleAnonymousPages(maxAgeMinutes);

    console.log(`[cleanup] Deleted ${deleted} stale anonymous pages (maxAge: ${maxAgeMinutes}min, remaining: ${remaining})`);

    return res.status(200).json({
      success: true,
      deleted,
      remaining,
      maxAgeMinutes,
    });

  } catch (error) {
    console.error('[cleanup] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}

