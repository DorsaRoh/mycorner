/**
 * POST /api/test/logout
 * 
 * TEST-ONLY: Clears the test session and all auth cookies.
 * This route is ONLY available when NODE_ENV === 'test'.
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
    const { clearAllAuthCookies } = await import('@/server/auth/session');
    clearAllAuthCookies(res);
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[test/logout] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

