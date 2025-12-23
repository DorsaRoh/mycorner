/**
 * POST /api/save-page
 * 
 * Saves page content (draft) to the database.
 * Used by the Editor in server mode for auto-saving.
 * 
 * Body: { pageId, title, blocks, background, localRevision, baseServerRevision }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getUserFromRequest } from '@/server/auth/session';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const user = await getUserFromRequest(req);
    if (!user?.id) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { pageId, title, blocks, background, localRevision, baseServerRevision } = req.body;

    if (!pageId) {
      return res.status(400).json({ success: false, error: 'Page ID is required' });
    }

    // Import database
    const db = await import('@/server/db');

    // Check page exists and user owns it
    const page = await db.getPageById(pageId);
    if (!page) {
      return res.status(404).json({ success: false, error: 'Page not found' });
    }

    // Check ownership
    const isOwner = page.owner_id === user.id || page.user_id === user.id;
    if (!isOwner) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    // Prepare content JSON
    const blocksWithIds = (blocks || []).map((block: any) => ({
      id: block.id || `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: block.type,
      x: block.x,
      y: block.y,
      width: block.width,
      height: block.height,
      content: block.content,
      style: block.style,
      effects: block.effects,
      rotation: block.rotation,
    }));
    const blocksJson = JSON.stringify(blocksWithIds);

    // Prepare background JSON
    let backgroundJson: string | undefined;
    if (background) {
      if (background.mode === 'solid' || background.mode === 'gradient') {
        backgroundJson = JSON.stringify(background);
      }
    }

    // Update page with conflict detection
    const result = await db.updatePage(
      pageId,
      {
        title: title || null,
        content: blocksJson,
        background: backgroundJson,
      },
      baseServerRevision
    );

    if (result.conflict) {
      return res.status(200).json({
        success: false,
        conflict: true,
        currentServerRevision: result.page?.server_revision ?? null,
        acceptedLocalRevision: null,
      });
    }

    return res.status(200).json({
      success: true,
      conflict: false,
      currentServerRevision: result.page?.server_revision ?? null,
      acceptedLocalRevision: localRevision ?? null,
      updatedAt: result.page?.updated_at,
    });
  } catch (error) {
    console.error('[api/save-page] Error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

