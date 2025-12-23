/**
 * GET /api/my-page
 * 
 * Returns the currently authenticated user's page data.
 * Used by the /edit page to load existing page for editing.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getUserFromRequest } from '@/server/auth/session';

interface BlockStyle {
  borderRadius?: number;
  shadowStrength?: number;
  shadowSoftness?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  textOpacity?: number;
  textAlign?: string;
}

interface BlockEffects {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hueShift?: number;
  blur?: number;
}

interface Block {
  id: string;
  type: 'TEXT' | 'IMAGE' | 'LINK';
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  style?: BlockStyle;
  effects?: BlockEffects;
  rotation?: number;
}

interface BackgroundConfig {
  mode: string;
  solid?: { color: string };
  gradient?: { type: string; colorA: string; colorB: string; angle: number };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only GET allowed
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      return res.status(200).json({ page: null, user: null });
    }

    // Import database
    const db = await import('@/server/db');

    // Get user's pages
    const pages = await db.getPagesByUserId(user.id);
    
    if (!pages || pages.length === 0) {
      return res.status(200).json({
        page: null,
        user: {
          id: user.id,
          username: user.username,
        },
      });
    }

    // Find the most recently published page (by publishedAt timestamp)
    const publishedPages = pages.filter(p => p.is_published && p.published_at);
    let page;
    
    if (publishedPages.length > 0) {
      // Sort by publishedAt descending (most recent first)
      publishedPages.sort((a, b) => {
        const dateA = new Date(a.published_at!).getTime();
        const dateB = new Date(b.published_at!).getTime();
        return dateB - dateA;
      });
      page = publishedPages[0];
    } else {
      // No published pages - return null
      return res.status(200).json({
        page: null,
        user: {
          id: user.id,
          username: user.username,
        },
      });
    }

    // parse blocks - handle both legacy array format and new PageDoc format
    let blocks: Block[] = [];
    try {
      const content = JSON.parse(page.content || '[]');
      // check if content is PageDoc format (has version and blocks) or legacy array
      if (Array.isArray(content)) {
        // legacy format: content is directly the blocks array
        blocks = content;
      } else if (content && typeof content === 'object' && Array.isArray(content.blocks)) {
        // PageDoc format: content is { version, blocks, title, ... }
        blocks = content.blocks;
      } else {
        console.warn('[api/my-page] unexpected content format:', typeof content);
        blocks = [];
      }
    } catch (e) {
      console.error('Failed to parse page content:', e);
    }

    // Parse background
    let background: BackgroundConfig | undefined;
    if (page.background) {
      try {
        background = JSON.parse(page.background);
      } catch (e) {
        console.error('Failed to parse page background:', e);
      }
    }

    return res.status(200).json({
      page: {
        id: page.id,
        title: page.title,
        isPublished: !!page.is_published,
        blocks,
        background,
        serverRevision: page.server_revision,
        publishedRevision: page.published_revision,
      },
      user: {
        id: user.id,
        username: user.username,
      },
    });
  } catch (error) {
    console.error('[api/my-page] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

