/**
 * GET /api/username/check?username=...
 * 
 * Checks if a username is available.
 * Used by the onboarding modal for real-time validation.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
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

// =============================================================================
// API Handler
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only GET allowed
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username } = req.query;

    if (!username || typeof username !== 'string') {
      return res.status(400).json({
        available: false,
        error: 'Username parameter required',
      });
    }

    // Validate format
    const parseResult = usernameSchema.safeParse(username);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      return res.status(200).json({
        available: false,
        error: firstError.message,
      });
    }

    const usernameClean = username.toLowerCase();

    // Check reserved usernames
    if (isReservedUsername(usernameClean)) {
      return res.status(200).json({
        available: false,
        error: 'This username is reserved',
      });
    }

    // Import database functions
    const db = await import('@/server/db');

    // Check if username is taken
    const taken = await db.isUsernameTaken(usernameClean);

    return res.status(200).json({
      available: !taken,
      error: taken ? 'Username is already taken' : null,
    });

  } catch (error) {
    console.error('[api/username/check] Error:', error);
    return res.status(500).json({
      available: false,
      error: 'Failed to check username availability',
    });
  }
}

