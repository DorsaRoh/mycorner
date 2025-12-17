import { Router } from 'express';
import * as db from '../db';
import { usernameSchema, isReservedUsername, validatePublishPageInput } from '../db/validation';
import { publishLimit } from '../rateLimit';

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
router.get('/username/check', async (req, res) => {
  const rawUsername = (req.query.username as string || '').trim();
  
  // Validate format with Zod
  const parseResult = usernameSchema.safeParse(rawUsername);
  if (!parseResult.success) {
    return res.json({
      available: false,
      error: parseResult.error.issues?.[0]?.message || 'Invalid username format',
    });
  }

  const username = parseResult.data;

  // Check reserved usernames
  if (isReservedUsername(username)) {
    return res.json({
      available: false,
      error: 'This username is reserved',
    });
  }

  const taken = await db.isUsernameTaken(username);
  res.json({
    available: !taken,
    error: taken ? 'Username is already taken' : null,
  });
});

/**
 * POST /api/onboarding
 * Sets username for the user. Page creation/publishing is handled separately
 * by the publish flow which preserves the user's draft content.
 * Body: { username: string }
 */
router.post('/onboarding', async (req, res) => {
  // Must be authenticated
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const { username } = req.body;

  // Validate username with Zod
  const parseResult = usernameSchema.safeParse(username);
  if (!parseResult.success) {
    return res.status(400).json({ 
      success: false, 
      error: parseResult.error.issues?.[0]?.message || 'Invalid username' 
    });
  }

  const usernameClean = parseResult.data;

  // Check reserved usernames
  if (isReservedUsername(usernameClean)) {
    return res.status(400).json({ success: false, error: 'This username is reserved' });
  }

  // Try to set username
  const result = await db.setUsername(req.user.id, usernameClean);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }

  // Refresh user from DB
  const updatedUser = await db.getUserById(req.user.id);

  res.json({
    success: true,
    user: updatedUser ? {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      username: updatedUser.username,
      avatarUrl: updatedUser.avatar_url,
    } : null,
  });
});

/**
 * POST /api/publish
 * Marks page as published and persists content snapshot
 * Body: { pageId: string, blocks: Block[], background?: BackgroundConfig, baseServerRevision: number }
 */
router.post('/publish', publishLimit, async (req, res) => {
  // Must be authenticated
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const { pageId, blocks, background, baseServerRevision } = req.body;

  if (!pageId) {
    return res.status(400).json({ success: false, error: 'pageId is required' });
  }

  // Validate input with Zod
  const validation = validatePublishPageInput({ blocks, background, baseServerRevision });
  if (!validation.valid) {
    return res.status(400).json({ success: false, error: validation.error });
  }

  // Get the page
  const page = await db.getPageById(pageId);
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
  const result = await db.publishPage({
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

  // Build public URL - canonical format is /{username}
  // If user has no username, they can't have a public URL yet
  const publicUrl = req.user.username ? `/${req.user.username}` : null;

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

