/**
 * GET /api/debug/env
 * 
 * Debug endpoint to check environment configuration.
 * Only shows non-sensitive values (presence, not actual secrets).
 */

import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const env = {
    NODE_ENV: process.env.NODE_ENV,
    APP_ORIGIN: process.env.APP_ORIGIN,
    PUBLIC_URL: process.env.PUBLIC_URL,
    
    // Show presence only (not actual values) for sensitive vars
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? '✓ set' : '✗ missing',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? '✓ set' : '✗ missing',
    SESSION_SECRET: process.env.SESSION_SECRET ? '✓ set' : '✗ missing',
    DATABASE_URL: process.env.DATABASE_URL ? '✓ set' : '✗ missing',
    
    // Vercel-specific
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
  };

  return res.status(200).json({
    timestamp: new Date().toISOString(),
    env,
  });
}

