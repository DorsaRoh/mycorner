/**
 * POST /api/test/login
 * 
 * TEST-ONLY: Creates a test session for E2E testing.
 * This route is ONLY available when NODE_ENV === 'test'.
 * 
 * Allows E2E tests to simulate authentication without going through OAuth.
 * 
 * Body:
 *   - userId: string (optional) - Use existing user ID
 *   - email: string (optional) - Create/find user by email
 *   - username: string (optional) - Set username for the user
 * 
 * Returns:
 *   - user: { id, email, username }
 *   - Sets session cookie
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
    const { userId, email, username } = req.body;
    
    // Import database
    const db = await import('@/server/db');
    const { setSessionCookie } = await import('@/server/auth/session');
    
    let user;
    
    if (userId) {
      // Find existing user
      user = await db.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
    } else if (email) {
      // Find or create user by email
      user = await db.getUserByEmail(email);
      if (!user) {
        // Create new user with fake Google sub
        user = await db.upsertUserByGoogleSub({
          googleSub: `test-google-sub-${Date.now()}`,
          email,
          name: email.split('@')[0],
        });
      }
    } else {
      // Create a completely new test user
      const testEmail = `test-${Date.now()}@example.com`;
      user = await db.upsertUserByGoogleSub({
        googleSub: `test-google-sub-${Date.now()}`,
        email: testEmail,
        name: 'Test User',
      });
    }
    
    // Set username if provided and not already set
    if (username && !user.username) {
      await db.setUsername(user.id, username);
      user = await db.getUserById(user.id);
    }
    
    // Set session cookie
    setSessionCookie(res, user!.id);
    
    return res.status(200).json({
      success: true,
      user: {
        id: user!.id,
        email: user!.email,
        username: user!.username,
        name: user!.name,
      },
    });
  } catch (error) {
    console.error('[test/login] Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

