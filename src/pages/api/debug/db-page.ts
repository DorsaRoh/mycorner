/**
 * GET /api/debug/db-page?slug=<slug>
 * 
 * Debug endpoint to check what's stored in the database for a published page.
 * Only available in development.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Only allow in development
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    // Allow if authenticated
    const { getUserFromRequest } = await import('@/server/auth/session');
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
  }
  
  const { slug } = req.query;
  
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'slug query parameter required' });
  }
  
  const normalizedSlug = slug.toLowerCase();
  
  try {
    const db = await import('@/server/db');
    
    // Try to find page by slug
    let page = await db.getPageBySlug(normalizedSlug);
    
    // If not found by slug, try as username
    if (!page) {
      const user = await db.getUserByUsername(normalizedSlug);
      if (user) {
        const pages = await db.getPagesByUserId(user.id);
        page = pages.find(p => p.is_published) || null;
      }
    }
    
    if (!page) {
      return res.status(404).json({ 
        error: 'Page not found',
        slug: normalizedSlug,
      });
    }
    
    // Parse and analyze the content
    let publishedContentAnalysis: Record<string, unknown> = {};
    if (page.published_content) {
      try {
        const parsed = typeof page.published_content === 'string' 
          ? JSON.parse(page.published_content) 
          : page.published_content;
        
        publishedContentAnalysis = {
          type: typeof parsed,
          isArray: Array.isArray(parsed),
          keys: typeof parsed === 'object' && parsed !== null ? Object.keys(parsed) : [],
          hasVersion: 'version' in parsed,
          hasBlocks: 'blocks' in parsed,
          blocksCount: parsed.blocks?.length ?? (Array.isArray(parsed) ? parsed.length : 0),
          blockTypes: parsed.blocks?.map((b: { type?: string }) => b.type) ?? [],
          preview: JSON.stringify(parsed).slice(0, 500) + '...',
        };
      } catch (e) {
        publishedContentAnalysis = {
          error: 'Failed to parse',
          message: e instanceof Error ? e.message : String(e),
          rawType: typeof page.published_content,
          rawLength: typeof page.published_content === 'string' ? page.published_content.length : 0,
          rawPreview: typeof page.published_content === 'string' 
            ? page.published_content.slice(0, 200) + '...' 
            : String(page.published_content),
        };
      }
    }
    
    return res.status(200).json({
      slug: normalizedSlug,
      found: true,
      page: {
        id: page.id,
        slug: page.slug,
        title: page.title,
        is_published: page.is_published,
        published_at: page.published_at,
        published_revision: page.published_revision,
        server_revision: page.server_revision,
        has_published_content: !!page.published_content,
        published_content_length: page.published_content?.length ?? 0,
        has_published_background: !!page.published_background,
      },
      publishedContentAnalysis,
    });
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      error: message,
      slug: normalizedSlug,
    });
  }
}

