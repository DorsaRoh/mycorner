/**
 * GET /api/auth/google
 * 
 * Initiates Google OAuth flow for Vercel/Next.js deployment.
 * This is a drop-in replacement for the Express /auth/google route.
 * 
 * Query params:
 *   - returnTo: URL to return to after auth (e.g., /new?publish=1)
 * 
 * Flow:
 * 1. Validates returnTo is a safe relative path
 * 2. Generates CSRF state and stores { state, returnTo } in httpOnly cookie
 * 3. Redirects to Google OAuth URL
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { setOAuthStateCookie, validateReturnTo } from '@/server/auth/session';

// =============================================================================
// Configuration
// =============================================================================

function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appOrigin = process.env.APP_ORIGIN || process.env.PUBLIC_URL;
  
  return {
    clientId,
    clientSecret,
    appOrigin,
    isConfigured: !!(clientId && clientSecret && appOrigin),
  };
}

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
  
  const config = getGoogleConfig();
  
  // Check if Google OAuth is configured
  if (!config.isConfigured) {
    console.error('[auth/google] Google OAuth not configured. Missing:', {
      GOOGLE_CLIENT_ID: !!config.clientId,
      GOOGLE_CLIENT_SECRET: !!config.clientSecret,
      APP_ORIGIN: !!config.appOrigin,
    });
    
    const returnTo = validateReturnTo(req.query.returnTo as string | undefined);
    return res.redirect(`${returnTo}?error=google_not_configured`);
  }
  
  // Validate and sanitize returnTo
  const returnTo = validateReturnTo(req.query.returnTo as string | undefined);
  
  // Generate state and store in cookie for CSRF protection
  const state = setOAuthStateCookie(res, returnTo);
  
  // Build Google OAuth URL
  const redirectUri = `${config.appOrigin}/api/auth/google/callback`;
  
  const params = new URLSearchParams({
    client_id: config.clientId!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    // Request offline access if we need refresh tokens in the future
    access_type: 'online',
    // Prompt select_account to allow switching accounts
    prompt: 'select_account',
  });
  
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  
  console.log(`[auth/google] Redirecting to Google OAuth, returnTo=${returnTo}`);
  
  return res.redirect(302, googleAuthUrl);
}

