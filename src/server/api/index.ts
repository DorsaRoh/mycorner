import { Router } from 'express';
import * as db from '../db';

const router = Router();

/**
 * GET /api/me
 * Returns current session + user profile
 */
router.get('/me', (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.json({
      authenticated: false,
      user: null,
      needsOnboarding: false,
    });
  }

  const user = req.user;
  res.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
    },
    needsOnboarding: !user.username,
  });
});

/**
 * GET /api/username/check?username=xxx
 * Check if username is available
 */
router.get('/username/check', (req, res) => {
  const username = (req.query.username as string || '').toLowerCase().trim();
  
  // Validate format
  const usernameRegex = /^[a-z0-9_]{3,20}$/;
  if (!usernameRegex.test(username)) {
    return res.json({
      available: false,
      error: 'Username must be 3-20 characters, lowercase letters, numbers, and underscores only',
    });
  }

  const taken = db.isUsernameTaken(username);
  res.json({
    available: !taken,
    error: taken ? 'Username is already taken' : null,
  });
});

/**
 * POST /api/onboarding
 * Sets username and creates default page with title
 * Body: { username: string, pageTitle: string }
 */
router.post('/onboarding', (req, res) => {
  // Must be authenticated
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const { username, pageTitle } = req.body;

  // Validate username
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ success: false, error: 'Username is required' });
  }

  const usernameClean = username.toLowerCase().trim();
  const usernameRegex = /^[a-z0-9_]{3,20}$/;
  if (!usernameRegex.test(usernameClean)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Username must be 3-20 characters, lowercase letters, numbers, and underscores only' 
    });
  }

  // Validate page title
  const title = (pageTitle || 'my corner').trim();
  if (title.length > 100) {
    return res.status(400).json({ success: false, error: 'Page title too long (max 100 characters)' });
  }

  // Try to set username
  const result = db.setUsername(req.user.id, usernameClean);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }

  // Create default page with the title
  const page = db.createDefaultPage(req.user.id, title);

  // Refresh user from DB
  const updatedUser = db.getUserById(req.user.id);

  res.json({
    success: true,
    user: updatedUser ? {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      username: updatedUser.username,
      avatarUrl: updatedUser.avatar_url,
    } : null,
    page: {
      id: page.id,
      title: page.title,
    },
  });
});

/**
 * POST /api/publish
 * Marks page as published and persists content snapshot
 * Body: { pageId: string, blocks: Block[], background?: BackgroundConfig, baseServerRevision: number }
 */
router.post('/publish', (req, res) => {
  // Must be authenticated
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const { pageId, blocks, background, baseServerRevision } = req.body;

  if (!pageId) {
    return res.status(400).json({ success: false, error: 'pageId is required' });
  }

  if (!blocks || !Array.isArray(blocks)) {
    return res.status(400).json({ success: false, error: 'blocks array is required' });
  }

  if (typeof baseServerRevision !== 'number') {
    return res.status(400).json({ success: false, error: 'baseServerRevision is required' });
  }

  // Get the page
  const page = db.getPageById(pageId);
  if (!page) {
    return res.status(404).json({ success: false, error: 'Page not found' });
  }

  // Verify ownership
  if (page.owner_id !== req.user.id && page.user_id !== req.user.id) {
    return res.status(403).json({ success: false, error: 'Not authorized to publish this page' });
  }

  // Generate slug from username
  const slug = req.user.username || undefined;

  // Publish the page with content snapshot
  const result = db.publishPage({
    id: pageId,
    content: JSON.stringify(blocks),
    background: background ? JSON.stringify(background) : undefined,
    baseServerRevision,
    slug,
  });

  if (result.conflict) {
    return res.status(409).json({ 
      success: false, 
      error: 'Content was modified. Please refresh and try again.',
      conflict: true,
      currentServerRevision: result.page?.server_revision,
    });
  }

  if (!result.page) {
    return res.status(500).json({ success: false, error: 'Failed to publish page' });
  }

  // Build public URL
  let publicUrl: string;
  if (req.user.username) {
    publicUrl = `/u/${req.user.username}`;
  } else {
    publicUrl = `/p/${pageId}`;
  }

  res.json({
    success: true,
    page: {
      id: result.page.id,
      title: result.page.title,
      slug: result.page.slug,
      isPublished: !!result.page.is_published,
    },
    publishedRevision: result.publishedRevision,
    publishedAt: result.publishedAt,
    publicUrl,
  });
});

export function createApiRouter() {
  return router;
}
