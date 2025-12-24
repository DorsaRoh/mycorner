/**
 * Session management for Vercel/Next.js API routes.
 * 
 * This module provides cookie-based session handling that works in serverless
 * environments without relying on Express session middleware.
 * 
 * Session cookie format: JWT containing { userId, exp }
 * OAuth state cookie format: JSON containing { state, returnTo }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import * as crypto from 'crypto';
import type { DbUser } from '../db/types';

// =============================================================================
// Configuration
// =============================================================================

const SESSION_COOKIE_NAME = 'yourcorner_session';
const OAUTH_STATE_COOKIE_NAME = 'yourcorner_oauth_state';
const ANONYMOUS_COOKIE_NAME = 'yourcorner_anon';
const DRAFT_OWNER_COOKIE_NAME = 'yourcorner_draft_owner';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Get the cookie domain from APP_ORIGIN/PUBLIC_URL.
 * Returns undefined to use the default behavior (current hostname).
 * This ensures cookies work reliably in serverless environments like Vercel.
 * 
 * Note: We don't set an explicit domain to avoid cross-subdomain cookie issues.
 * Cookies will be set for the exact hostname (e.g., www.itsmycorner.com).
 */
function getCookieDomain(): string | undefined {
  // Always return undefined to use default cookie behavior
  // This ensures cookies are set for the exact hostname that receives the request
  return undefined;
}

// Get secret from environment 
function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET environment variable is required in production');
    }
    // Use a default for development
    return 'dev-session-secret-not-for-production';
  }
  return secret;
}

// =============================================================================
// Simple JWT-like token (HMAC-SHA256 signed)
// =============================================================================

interface SessionPayload {
  userId: string;
  exp: number; // Unix timestamp
}

function createSessionToken(payload: SessionPayload): string {
  const secret = getSessionSecret();
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifySessionToken(token: string): SessionPayload | null {
  try {
    const secret = getSessionSecret();
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [header, body, signature] = parts;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${body}`)
      .digest('base64url');
    
    // Constant-time comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }
    
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload;
    
    // Check expiration
    if (payload.exp < Date.now() / 1000) {
      return null;
    }
    
    return payload;
  } catch {
    return null;
  }
}

// =============================================================================
// Cookie Helpers
// =============================================================================

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) {
      cookies[name] = decodeURIComponent(rest.join('='));
    }
  });
  
  return cookies;
}

function serializeCookie(
  name: string, 
  value: string, 
  options: {
    maxAge?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
    path?: string;
    domain?: string;
  } = {}
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }
  if (options.httpOnly) {
    parts.push('HttpOnly');
  }
  if (options.secure) {
    parts.push('Secure');
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1)}`);
  }
  if (options.path) {
    parts.push(`Path=${options.path}`);
  }
  if (options.domain) {
    parts.push(`Domain=${options.domain}`);
  }
  
  return parts.join('; ');
}

// =============================================================================
// Session API
// =============================================================================

/**
 * Get user from request by reading the session cookie.
 * Returns the user object or null if not authenticated.
 */
export async function getUserFromRequest(req: NextApiRequest): Promise<DbUser | null> {
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies[SESSION_COOKIE_NAME];
  
  if (!sessionToken) {
    return null;
  }
  
  const payload = verifySessionToken(sessionToken);
  if (!payload) {
    return null;
  }
  
  // Fetch user from database
  const { getUserById } = await import('../db');
  const user = await getUserById(payload.userId);
  
  return user || null;
}

/**
 * Set session cookie for a user.
 * Call this after successful authentication.
 */
export function setSessionCookie(res: NextApiResponse, userId: string): void {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const token = createSessionToken({ userId, exp });
  
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieDomain = getCookieDomain();
  
  const cookie = serializeCookie(SESSION_COOKIE_NAME, token, {
    maxAge: SESSION_MAX_AGE_SECONDS,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    domain: cookieDomain,
  });
  
  // Append to existing cookies if any
  const existingCookies = res.getHeader('Set-Cookie');
  if (existingCookies) {
    const cookiesArray = Array.isArray(existingCookies) ? existingCookies : [existingCookies as string];
    res.setHeader('Set-Cookie', [...cookiesArray, cookie]);
  } else {
    res.setHeader('Set-Cookie', cookie);
  }
}

/**
 * Clear session cookie (logout).
 */
export function clearSessionCookie(res: NextApiResponse): void {
  const cookieDomain = getCookieDomain();
  
  const cookie = serializeCookie(SESSION_COOKIE_NAME, '', {
    maxAge: 0,
    httpOnly: true,
    path: '/',
    domain: cookieDomain,
  });
  
  res.setHeader('Set-Cookie', cookie);
}

/**
 * Clear all auth-related cookies (for full logout).
 * This clears: session, draft owner token, and anonymous session.
 * 
 * IMPORTANT: Cookie clearing must match the attributes used when setting
 * (secure, sameSite, path, domain) for browsers to properly match and delete them.
 */
export function clearAllAuthCookies(res: NextApiResponse): void {
  const cookieDomain = getCookieDomain();
  const isProduction = process.env.NODE_ENV === 'production';
  
  const cookiesToClear = [
    SESSION_COOKIE_NAME,
    DRAFT_OWNER_COOKIE_NAME,
    ANONYMOUS_COOKIE_NAME,
    OAUTH_STATE_COOKIE_NAME,
  ];
  
  const cookies = cookiesToClear.map(name => 
    serializeCookie(name, '', {
      maxAge: 0,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      domain: cookieDomain,
    })
  );
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[session] Clearing auth cookies:', cookiesToClear);
  }
  
  res.setHeader('Set-Cookie', cookies);
}

// =============================================================================
// OAuth State Cookie (for CSRF protection)
// =============================================================================

interface OAuthState {
  state: string;
  returnTo: string;
}

/**
 * Generate and store OAuth state for CSRF protection.
 */
export function setOAuthStateCookie(res: NextApiResponse, returnTo: string): string {
  const state = crypto.randomBytes(32).toString('hex');
  
  const payload: OAuthState = { state, returnTo };
  const value = Buffer.from(JSON.stringify(payload)).toString('base64');
  
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieDomain = getCookieDomain();
  
  const cookie = serializeCookie(OAUTH_STATE_COOKIE_NAME, value, {
    maxAge: 600, // 10 minutes
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    domain: cookieDomain,
  });
  
  // Append to existing cookies if any
  const existingCookies = res.getHeader('Set-Cookie');
  if (existingCookies) {
    const cookiesArray = Array.isArray(existingCookies) ? existingCookies : [existingCookies as string];
    res.setHeader('Set-Cookie', [...cookiesArray, cookie]);
  } else {
    res.setHeader('Set-Cookie', cookie);
  }
  
  return state;
}

/**
 * Verify OAuth state and return the stored returnTo URL.
 * Clears the state cookie after verification.
 */
export function verifyOAuthState(
  req: NextApiRequest, 
  res: NextApiResponse, 
  state: string
): { valid: boolean; returnTo: string } {
  const cookies = parseCookies(req.headers.cookie);
  const stateValue = cookies[OAUTH_STATE_COOKIE_NAME];
  const cookieDomain = getCookieDomain();
  
  // Always clear the state cookie
  const clearCookie = serializeCookie(OAUTH_STATE_COOKIE_NAME, '', {
    maxAge: 0,
    httpOnly: true,
    path: '/',
    domain: cookieDomain,
  });
  
  const existingCookies = res.getHeader('Set-Cookie');
  if (existingCookies) {
    const cookiesArray = Array.isArray(existingCookies) ? existingCookies : [existingCookies as string];
    res.setHeader('Set-Cookie', [...cookiesArray, clearCookie]);
  } else {
    res.setHeader('Set-Cookie', clearCookie);
  }
  
  if (!stateValue) {
    return { valid: false, returnTo: '/edit' };
  }
  
  try {
    const payload = JSON.parse(Buffer.from(stateValue, 'base64').toString()) as OAuthState;
    
    // Constant-time comparison
    if (!crypto.timingSafeEqual(Buffer.from(state), Buffer.from(payload.state))) {
      return { valid: false, returnTo: '/edit' };
    }
    
    return { valid: true, returnTo: payload.returnTo || '/edit' };
  } catch {
    return { valid: false, returnTo: '/edit' };
  }
}

/**
 * Validate that returnTo is a safe relative path.
 * Prevents open redirect vulnerabilities.
 */
export function validateReturnTo(returnTo: string | undefined): string {
  // Default to /edit if no returnTo
  if (!returnTo) {
    return '/edit';
  }
  
  // Must start with /
  if (!returnTo.startsWith('/')) {
    return '/edit';
  }
  
  // Must NOT contain :// (prevents http://, https://, javascript://, etc.)
  if (returnTo.includes('://')) {
    return '/edit';
  }
  
  // Must NOT start with // (protocol-relative URLs)
  if (returnTo.startsWith('//')) {
    return '/edit';
  }
  
  return returnTo;
}

// =============================================================================
// Anonymous Session Cookie (for draft mode uploads)
// =============================================================================

const ANONYMOUS_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days
const DRAFT_OWNER_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Get or create an anonymous session ID from the request.
 * This is used for rate limiting and storage tracking for anonymous users.
 * Returns the anonymous ID or null if unable to get/create one.
 */
export async function getAnonymousIdFromRequest(req: NextApiRequest, res?: NextApiResponse): Promise<string | null> {
  const cookies = parseCookies(req.headers.cookie);
  
  // Check if user is authenticated - if so, use their user ID
  const sessionToken = cookies[SESSION_COOKIE_NAME];
  if (sessionToken) {
    const payload = verifySessionToken(sessionToken);
    if (payload) {
      return payload.userId;
    }
  }
  
  // Check for existing anonymous cookie
  let anonId = cookies[ANONYMOUS_COOKIE_NAME];
  
  // If no anonymous cookie exists and we have a response object, create one
  if (!anonId && res) {
    anonId = `anon_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieDomain = getCookieDomain();
    
    const cookie = serializeCookie(ANONYMOUS_COOKIE_NAME, anonId, {
      maxAge: ANONYMOUS_MAX_AGE_SECONDS,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      domain: cookieDomain,
    });
    
    // Append to existing cookies if any
    const existingCookies = res.getHeader('Set-Cookie');
    if (existingCookies) {
      const cookiesArray = Array.isArray(existingCookies) ? existingCookies : [existingCookies as string];
      res.setHeader('Set-Cookie', [...cookiesArray, cookie]);
    } else {
      res.setHeader('Set-Cookie', cookie);
    }
  }
  
  return anonId || null;
}

// =============================================================================
// Draft Owner Token (for anonymous draft ownership)
// =============================================================================

/**
 * Get or create a draft owner token for anonymous users.
 * This token is used to track ownership of drafts before authentication.
 */
export async function getDraftOwnerToken(req: NextApiRequest, res?: NextApiResponse): Promise<string | null> {
  const cookies = parseCookies(req.headers.cookie);
  
  // Check for existing draft owner cookie
  let draftToken = cookies[DRAFT_OWNER_COOKIE_NAME];
  
  // If no token exists and we have a response object, create one
  if (!draftToken && res) {
    draftToken = `draft_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
    
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieDomain = getCookieDomain();
    
    const cookie = serializeCookie(DRAFT_OWNER_COOKIE_NAME, draftToken, {
      maxAge: DRAFT_OWNER_MAX_AGE_SECONDS,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      domain: cookieDomain,
    });
    
    // Append to existing cookies if any
    const existingCookies = res.getHeader('Set-Cookie');
    if (existingCookies) {
      const cookiesArray = Array.isArray(existingCookies) ? existingCookies : [existingCookies as string];
      res.setHeader('Set-Cookie', [...cookiesArray, cookie]);
    } else {
      res.setHeader('Set-Cookie', cookie);
    }
  }
  
  return draftToken || null;
}

/**
 * Get draft owner token from raw cookie header (for getServerSideProps).
 */
export function getDraftOwnerTokenFromCookies(cookieHeader: string | undefined): string | null {
  const cookies = parseCookies(cookieHeader);
  return cookies[DRAFT_OWNER_COOKIE_NAME] || null;
}

/**
 * Get user ID from raw cookie header (for getServerSideProps).
 * Returns the user ID if session is valid, null otherwise.
 */
export async function getUserIdFromCookies(cookieHeader: string | undefined): Promise<string | null> {
  const cookies = parseCookies(cookieHeader);
  const sessionToken = cookies[SESSION_COOKIE_NAME];
  
  if (!sessionToken) {
    return null;
  }
  
  const payload = verifySessionToken(sessionToken);
  if (!payload) {
    return null;
  }
  
  return payload.userId;
}

/**
 * Build Set-Cookie header value for draft owner token.
 * Use this when setting cookies in getServerSideProps via headers.
 */
export function buildDraftOwnerTokenCookie(token: string): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieDomain = getCookieDomain();
  
  return serializeCookie(DRAFT_OWNER_COOKIE_NAME, token, {
    maxAge: DRAFT_OWNER_MAX_AGE_SECONDS,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    domain: cookieDomain,
  });
}

/**
 * Generate a new draft owner token.
 */
export function generateDraftOwnerToken(): string {
  return `draft_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
}

