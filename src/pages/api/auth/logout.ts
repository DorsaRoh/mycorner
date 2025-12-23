/**
 * POST /api/auth/logout
 * GET /api/auth/logout
 * 
 * Logs out the current user by clearing the session cookie.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { clearSessionCookie } from '@/server/auth/session';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Allow both GET and POST for logout
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Clear the session cookie
  clearSessionCookie(res);

  // For POST requests, return JSON
  if (req.method === 'POST') {
    return res.status(200).json({ success: true });
  }

  // For GET requests, redirect to home
  return res.redirect('/');
}

