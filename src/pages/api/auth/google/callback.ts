/**
 * GET /api/auth/google/callback
 * 
 * Google OAuth callback handler for Vercel/Next.js deployment.
 * This is a drop-in replacement for the Express /auth/google/callback route.
 * 
 * Flow:
 * 1. Validates state matches cookie (CSRF protection)
 * 2. Exchanges code for tokens with Google
 * 3. Fetches user profile from Google
 * 4. Upserts user in database
 * 5. Sets session cookie
 * 6. Redirects to returnTo URL (or /new by default)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyOAuthState, setSessionCookie } from '@/server/auth/session';

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
// Google Token Exchange
// =============================================================================

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  id_token?: string;
}

interface GoogleUserInfo {
  sub: string;        // Google's unique user ID
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

async function exchangeCodeForTokens(
  code: string, 
  redirectUri: string,
  config: ReturnType<typeof getGoogleConfig>
): Promise<GoogleTokenResponse> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: config.clientId!,
      client_secret: config.clientSecret!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error('[auth/callback] Token exchange failed:', error);
    throw new Error('Failed to exchange code for tokens');
  }
  
  return response.json();
}

async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error('[auth/callback] Failed to fetch user info:', error);
    throw new Error('Failed to fetch user info');
  }
  
  return response.json();
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
    console.error('[auth/callback] Google OAuth not configured');
    return res.redirect('/?error=google_not_configured');
  }
  
  const { code, state, error } = req.query;
  
  // Handle OAuth error (user cancelled, etc.)
  if (error) {
    console.log('[auth/callback] OAuth error:', error);
    return res.redirect('/?error=auth_cancelled');
  }
  
  // Validate required params
  if (!code || typeof code !== 'string') {
    console.error('[auth/callback] Missing code parameter');
    return res.redirect('/?error=auth_error');
  }
  
  if (!state || typeof state !== 'string') {
    console.error('[auth/callback] Missing state parameter');
    return res.redirect('/?error=auth_error');
  }
  
  // Verify state (CSRF protection)
  const stateResult = verifyOAuthState(req, res, state);
  if (!stateResult.valid) {
    console.error('[auth/callback] Invalid state - possible CSRF attempt');
    return res.redirect('/?error=auth_error');
  }
  
  const returnTo = stateResult.returnTo;
  
  try {
    const redirectUri = `${config.appOrigin}/api/auth/google/callback`;
    
    // Exchange code for tokens
    console.log('[auth/callback] Exchanging code for tokens...');
    const tokens = await exchangeCodeForTokens(code, redirectUri, config);
    
    // Fetch user info
    console.log('[auth/callback] Fetching user info...');
    const userInfo = await fetchUserInfo(tokens.access_token);
    
    if (!userInfo.email) {
      console.error('[auth/callback] No email in user info');
      return res.redirect('/?error=auth_error');
    }
    
    // Upsert user in database
    console.log('[auth/callback] Upserting user:', userInfo.email);
    const db = await import('@/server/db');
    
    const user = await db.upsertUserByGoogleSub({
      googleSub: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
      avatarUrl: userInfo.picture,
    });
    
    // Set session cookie
    setSessionCookie(res, user.id);
    
    console.log(`[auth/callback] User authenticated: ${user.id}, redirecting to ${returnTo}`);
    
    // Redirect to returnTo URL
    // If user has no username, we could redirect to onboarding, but the current flow
    // just uses returnTo and lets the publish flow handle it
    return res.redirect(returnTo);
    
  } catch (error) {
    console.error('[auth/callback] Error:', error);
    return res.redirect('/?error=auth_error');
  }
}

