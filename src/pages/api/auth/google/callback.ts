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
import { upsertUserByGoogleSub } from '@/server/db';

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
  console.log('[auth/callback] === OAuth Callback Started ===');
  console.log('[auth/callback] Request URL:', req.url);
  console.log('[auth/callback] Host:', req.headers.host);
  console.log('[auth/callback] APP_ORIGIN:', process.env.APP_ORIGIN);
  console.log('[auth/callback] PUBLIC_URL:', process.env.PUBLIC_URL);
  console.log('[auth/callback] NODE_ENV:', process.env.NODE_ENV);
  console.log('[auth/callback] Cookies present:', !!req.headers.cookie);
  
  // Only GET allowed
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const config = getGoogleConfig();
  
  // Check if Google OAuth is configured
  if (!config.isConfigured) {
    console.error('[auth/callback] Google OAuth not configured. Missing:', {
      clientId: !!config.clientId,
      clientSecret: !!config.clientSecret,
      appOrigin: !!config.appOrigin,
    });
    return res.redirect('/?error=google_not_configured');
  }
  
  const { code, state, error } = req.query;
  
  // Handle OAuth error (user cancelled, etc.)
  if (error) {
    console.log('[auth/callback] OAuth error from Google:', error);
    return res.redirect('/?error=auth_cancelled');
  }
  
  // Validate required params
  if (!code || typeof code !== 'string') {
    console.error('[auth/callback] Missing code parameter. Query:', JSON.stringify(req.query));
    return res.redirect('/?error=auth_error&reason=missing_code');
  }
  
  if (!state || typeof state !== 'string') {
    console.error('[auth/callback] Missing state parameter. Query:', JSON.stringify(req.query));
    return res.redirect('/?error=auth_error&reason=missing_state');
  }
  
  console.log('[auth/callback] Code and state present, verifying state...');
  
  // Verify state (CSRF protection)
  const stateResult = verifyOAuthState(req, res, state);
  if (!stateResult.valid) {
    console.error('[auth/callback] STATE VERIFICATION FAILED');
    console.error('[auth/callback] Debug info:', {
      hasStateCookie: !!req.headers.cookie?.includes('yourcorner_oauth_state'),
      cookieNames: req.headers.cookie?.split(';').map(c => c.trim().split('=')[0]) || [],
      appOrigin: config.appOrigin,
      host: req.headers.host,
      nodeEnv: process.env.NODE_ENV,
    });
    return res.redirect('/?error=auth_error&reason=state_mismatch');
  }
  
  console.log('[auth/callback] State verified successfully');
  const returnTo = stateResult.returnTo;
  
  try {
    const redirectUri = `${config.appOrigin}/api/auth/google/callback`;
    console.log('[auth/callback] Using redirect_uri:', redirectUri);
    
    // Exchange code for tokens
    console.log('[auth/callback] Exchanging code for tokens...');
    const tokens = await exchangeCodeForTokens(code, redirectUri, config);
    console.log('[auth/callback] Token exchange successful');
    
    // Fetch user info
    console.log('[auth/callback] Fetching user info...');
    const userInfo = await fetchUserInfo(tokens.access_token);
    console.log('[auth/callback] User info received:', userInfo.email);
    
    if (!userInfo.email) {
      console.error('[auth/callback] No email in user info');
      return res.redirect('/?error=auth_error&reason=no_email');
    }
    
    // Upsert user in database
    console.log('[auth/callback] Upserting user:', userInfo.email);
    
    const user = await upsertUserByGoogleSub({
      googleSub: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
      avatarUrl: userInfo.picture,
    });
    
    // Set session cookie
    setSessionCookie(res, user.id);
    
    console.log(`[auth/callback] SUCCESS! User authenticated: ${user.id}, redirecting to ${returnTo}`);
    
    // Redirect to returnTo URL
    return res.redirect(returnTo);
    
  } catch (err) {
    console.error('[auth/callback] ========== CAUGHT ERROR ==========');
    console.error('[auth/callback] Error type:', err?.constructor?.name);
    console.error('[auth/callback] Error message:', err instanceof Error ? err.message : String(err));
    console.error('[auth/callback] Error stack:', err instanceof Error ? err.stack : 'No stack');
    console.error('[auth/callback] Full error:', JSON.stringify(err, Object.getOwnPropertyNames(err || {}), 2));
    console.error('[auth/callback] ===================================');
    return res.redirect('/?error=auth_error&reason=exception');
  }
}

