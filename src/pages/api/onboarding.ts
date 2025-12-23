/**
 * POST /api/onboarding
 * 
 * Sets username for the authenticated user.
 * Called after OAuth login when user needs to choose a username.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getUserFromRequest } from '@/server/auth/session';
import { isReservedUsername } from '@/lib/routes';

// =============================================================================
// Schema
// =============================================================================

const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username must be at most 20 characters')
  .regex(/^[a-z0-9_-]+$/, 'Username can only contain lowercase letters, numbers, hyphens, and underscores')
  .regex(/^[a-z0-9]/, 'Username must start with a letter or number')
  .regex(/[a-z0-9]$/, 'Username must end with a letter or number');

const RequestSchema = z.object({
  username: usernameSchema,
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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get user from session
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }

    // Parse request body
    const parseResult = RequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      return res.status(400).json({
        success: false,
        error: firstError.message,
      });
    }

    const { username } = parseResult.data;
    const usernameClean = username.toLowerCase();

    // Check reserved usernames
    if (isReservedUsername(usernameClean)) {
      return res.status(400).json({ 
        success: false, 
        error: 'This username is reserved' 
      });
    }

    // Import database functions
    const db = await import('@/server/db');

    // Try to set username
    const result = await db.setUsername(user.id, usernameClean);
    if (!result.success) {
      return res.status(400).json({ 
        success: false, 
        error: result.error || 'Failed to set username' 
      });
    }

    // Refresh user from DB
    const updatedUser = await db.getUserById(user.id);

    return res.status(200).json({
      success: true,
      user: updatedUser ? {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        username: updatedUser.username,
        avatarUrl: updatedUser.avatar_url,
      } : null,
    });

  } catch (error) {
    console.error('[api/onboarding] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}

