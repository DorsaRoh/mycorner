/**
 * POST /api/auth/logout
 * GET /api/auth/logout
 * 
 * Logs out the current user by clearing all auth-related cookies.
 * This includes:
 * - Session cookie (auth state)
 * - Draft owner token (anonymous draft ownership)
 * - Anonymous session cookie
 * - OAuth state cookie
 * 
 * After logout, client should redirect to /new?fresh=1 for a clean start.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { clearAllAuthCookies } from '@/server/auth/session';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Allow both GET and POST for logout
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Clear all auth-related cookies (session, draft owner, anon, oauth state)
  clearAllAuthCookies(res);

  // Prevent any caching of logout response
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (process.env.NODE_ENV === 'development') {
    console.log('[logout] Cleared all auth cookies, cookies header:', res.getHeader('Set-Cookie'));
  }

  // For POST requests, return JSON with redirect instruction
  if (req.method === 'POST') {
    return res.status(200).json({ 
      ok: true, 
      success: true,
      redirectTo: '/new?fresh=1',
      message: 'Logged out successfully. All auth cookies cleared.',
    });
  }

  // For GET requests, redirect to /new with fresh flag for a clean start
  return res.redirect('/new?fresh=1');
}

