/**
 * POST /api/test/seed
 * 
 * TEST-ONLY: Seeds the database with test data.
 * This route is ONLY available when NODE_ENV === 'test'.
 * 
 * Body:
 *   - clear: boolean - Whether to clear existing data first
 *   - users: Array of user data
 *   - pages: Array of page data
 */

import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // CRITICAL: Only allow in test environment
  if (process.env.NODE_ENV !== 'test') {
    return res.status(404).json({ error: 'Not found' });
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { clear, users = [], pages = [] } = req.body;
    const db = await import('@/server/db/sqlite');
    
    // Clear existing data if requested
    if (clear) {
      db.db.exec(`
        DELETE FROM feedback;
        DELETE FROM product_feedback;
        DELETE FROM pages;
        DELETE FROM users;
      `);
    }
    
    const createdUsers: Record<string, unknown>[] = [];
    const createdPages: Record<string, unknown>[] = [];
    
    // Create users
    for (const userData of users) {
      const user = db.upsertUserByGoogleSub({
        googleSub: userData.googleSub || `test-sub-${Date.now()}-${Math.random()}`,
        email: userData.email,
        name: userData.name,
        avatarUrl: userData.avatarUrl,
      });
      
      if (userData.username) {
        db.setUsername(user.id, userData.username);
      }
      
      createdUsers.push({
        id: user.id,
        email: user.email,
        username: userData.username || null,
      });
    }
    
    // Create pages
    for (const pageData of pages) {
      const ownerId = pageData.ownerId;
      const userId = pageData.userId || null;
      
      const page = db.createPage(ownerId, pageData.title, userId);
      
      // Update content if provided
      if (pageData.content) {
        db.updatePage(page.id, { content: pageData.content });
      }
      
      // Update background if provided
      if (pageData.background) {
        db.updatePage(page.id, { background: pageData.background });
      }
      
      // Publish if needed
      if (pageData.isPublished && pageData.slug) {
        const updatedPage = db.getPageById(page.id);
        db.publishPage({
          id: page.id,
          content: updatedPage!.content,
          background: updatedPage!.background || undefined,
          baseServerRevision: updatedPage!.server_revision,
          slug: pageData.slug,
        });
      }
      
      const finalPage = db.getPageById(page.id);
      createdPages.push({
        id: finalPage!.id,
        slug: finalPage!.slug,
        isPublished: finalPage!.is_published === 1,
      });
    }
    
    return res.status(200).json({
      success: true,
      users: createdUsers,
      pages: createdPages,
    });
  } catch (error) {
    console.error('[test/seed] Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

