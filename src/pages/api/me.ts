/**
 * GET /api/me
 * 
 * Returns the currently authenticated user or null.
 * Uses session cookie for authentication.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getUserFromRequest } from '@/server/auth/session';

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
      return res.status(200).json({ user: null });
    }

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        avatarUrl: user.avatar_url,
      },
    });
  } catch (error) {
    console.error('[api/me] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

