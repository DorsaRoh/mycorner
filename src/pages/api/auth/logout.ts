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

  if (process.env.NODE_ENV === 'development') {
    console.log('[logout] Cleared all auth cookies');
  }

  // For POST requests, return JSON
  if (req.method === 'POST') {
    return res.status(200).json({ ok: true, success: true });
  }

  // For GET requests, redirect to /new for a fresh start
  return res.redirect('/new');
}

