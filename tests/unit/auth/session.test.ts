/**
 * Unit tests for session management.
 * 
 * Tests the session cookie and token utilities.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  clearTestData,
  resetCounters,
} from '../../utils/testDb';
import {
  createTestSessionToken,
  createTestSessionCookie,
  createTestDraftOwnerCookie,
  createTestCookies,
  createMockRequest,
  createMockResponse,
} from '../../utils/session';

describe('Session Management', () => {
  beforeEach(async () => {
    resetCounters();
    await clearTestData();
  });

  afterEach(async () => {
    await clearTestData();
  });

  describe('Session Token', () => {
    it('creates valid session token', () => {
      const token = createTestSessionToken('user-123');
      expect(token).toBeTruthy();
      expect(token.split('.')).toHaveLength(3);
    });

    it('creates cookie with correct format', () => {
      const cookie = createTestSessionCookie('user-123');
      expect(cookie).toContain('yourcorner_session=');
    });
  });

  describe('Draft Owner Token', () => {
    it('creates draft owner cookie', () => {
      const cookie = createTestDraftOwnerCookie('draft_123_abc');
      expect(cookie).toContain('yourcorner_draft_owner=');
      expect(cookie).toContain('draft_123_abc');
    });
  });

  describe('Combined Cookies', () => {
    it('creates combined cookies for authenticated user', () => {
      const cookies = createTestCookies('user-123', 'draft_token_abc');
      expect(cookies).toContain('yourcorner_session=');
      expect(cookies).toContain('yourcorner_draft_owner=');
      expect(cookies).toContain('; '); // separator
    });

    it('creates only session cookie when no draft token', () => {
      const cookies = createTestCookies('user-123');
      expect(cookies).toContain('yourcorner_session=');
      expect(cookies).not.toContain('yourcorner_draft_owner=');
    });

    it('creates only draft cookie when no user', () => {
      const cookies = createTestCookies(undefined, 'draft_token_abc');
      expect(cookies).toContain('yourcorner_draft_owner=');
      expect(cookies).not.toContain('yourcorner_session=');
    });
  });

  describe('getUserFromRequest', () => {
    it('returns user for valid session', async () => {
      const db = await import('@/server/db/sqlite');
      const { getUserFromRequest } = await import('@/server/auth/session');
      
      const user = db.upsertUserByGoogleSub({
        googleSub: 'test-sub',
        email: 'test@example.com',
        name: 'Test',
      });
      
      const req = createMockRequest('GET', {}, createTestSessionCookie(user.id));
      
      const result = await getUserFromRequest(req as any);
      
      expect(result).toBeTruthy();
      expect(result!.id).toBe(user.id);
      expect(result!.email).toBe('test@example.com');
    });

    it('returns null for missing cookie', async () => {
      const { getUserFromRequest } = await import('@/server/auth/session');
      
      const req = createMockRequest('GET');
      
      const result = await getUserFromRequest(req as any);
      
      expect(result).toBeNull();
    });

    it('returns null for invalid token', async () => {
      const { getUserFromRequest } = await import('@/server/auth/session');
      
      const req = createMockRequest('GET', {}, 'yourcorner_session=invalid_token');
      
      const result = await getUserFromRequest(req as any);
      
      expect(result).toBeNull();
    });
  });

  describe('getDraftOwnerToken', () => {
    it('returns token from cookie', async () => {
      const { getDraftOwnerTokenFromCookies } = await import('@/server/auth/session');
      
      const token = 'draft_123_abc';
      const cookieHeader = `yourcorner_draft_owner=${token}`;
      
      const result = getDraftOwnerTokenFromCookies(cookieHeader);
      
      expect(result).toBe(token);
    });

    it('returns null for missing cookie', async () => {
      const { getDraftOwnerTokenFromCookies } = await import('@/server/auth/session');
      
      const result = getDraftOwnerTokenFromCookies(undefined);
      
      expect(result).toBeNull();
    });
  });

  describe('validateReturnTo', () => {
    it('accepts valid relative paths', async () => {
      const { validateReturnTo } = await import('@/server/auth/session');
      
      expect(validateReturnTo('/edit')).toBe('/edit');
      expect(validateReturnTo('/edit/page123')).toBe('/edit/page123');
      expect(validateReturnTo('/')).toBe('/');
    });

    it('rejects absolute URLs', async () => {
      const { validateReturnTo } = await import('@/server/auth/session');
      
      expect(validateReturnTo('https://evil.com')).toBe('/edit');
      expect(validateReturnTo('//evil.com')).toBe('/edit');
    });

    it('defaults to /edit for empty input', async () => {
      const { validateReturnTo } = await import('@/server/auth/session');
      
      expect(validateReturnTo('')).toBe('/edit');
      expect(validateReturnTo(undefined)).toBe('/edit');
    });

    it('rejects paths without leading slash', async () => {
      const { validateReturnTo } = await import('@/server/auth/session');
      
      expect(validateReturnTo('edit')).toBe('/edit');
    });
  });
});

