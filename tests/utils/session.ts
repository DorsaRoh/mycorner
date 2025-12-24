/**
 * Session utilities for testing.
 * 
 * Provides helpers to create mock sessions and cookies for tests.
 */

import * as crypto from 'crypto';

const SESSION_COOKIE_NAME = 'yourcorner_session';
const DRAFT_OWNER_COOKIE_NAME = 'yourcorner_draft_owner';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Get the test session secret.
 */
function getTestSecret(): string {
  return process.env.SESSION_SECRET || 'test-session-secret-for-testing-only';
}

interface SessionPayload {
  userId: string;
  exp: number;
}

/**
 * Create a session token for a user.
 */
export function createTestSessionToken(userId: string): string {
  const secret = getTestSecret();
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload: SessionPayload = { userId, exp };
  
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  
  return `${header}.${body}.${signature}`;
}

/**
 * Create a session cookie header value.
 */
export function createTestSessionCookie(userId: string): string {
  const token = createTestSessionToken(userId);
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
}

/**
 * Create a draft owner token cookie header value.
 */
export function createTestDraftOwnerCookie(token: string): string {
  return `${DRAFT_OWNER_COOKIE_NAME}=${encodeURIComponent(token)}`;
}

/**
 * Create combined cookies for authenticated user with draft token.
 */
export function createTestCookies(
  userId?: string,
  draftToken?: string
): string {
  const cookies: string[] = [];
  
  if (userId) {
    cookies.push(createTestSessionCookie(userId));
  }
  
  if (draftToken) {
    cookies.push(createTestDraftOwnerCookie(draftToken));
  }
  
  return cookies.join('; ');
}

/**
 * Create a mock NextApiRequest with cookies.
 */
export function createMockRequest(
  method: string = 'GET',
  body: Record<string, unknown> = {},
  cookies: string = ''
): { method: string; body: Record<string, unknown>; headers: { cookie?: string }; query: Record<string, string> } {
  return {
    method,
    body,
    headers: cookies ? { cookie: cookies } : {},
    query: {},
  };
}

/**
 * Create a mock NextApiResponse.
 */
export function createMockResponse(): {
  statusCode: number;
  headers: Map<string, string | string[]>;
  jsonBody: unknown;
  status: (code: number) => { json: (data: unknown) => void };
  json: (data: unknown) => void;
  setHeader: (name: string, value: string | string[]) => void;
  getHeader: (name: string) => string | string[] | undefined;
} {
  const res = {
    statusCode: 200,
    headers: new Map<string, string | string[]>(),
    jsonBody: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return {
        json(data: unknown) {
          res.jsonBody = data;
        },
      };
    },
    json(data: unknown) {
      res.jsonBody = data;
    },
    setHeader(name: string, value: string | string[]) {
      res.headers.set(name.toLowerCase(), value);
    },
    getHeader(name: string) {
      return res.headers.get(name.toLowerCase());
    },
  };
  return res;
}

