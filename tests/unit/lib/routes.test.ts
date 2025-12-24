/**
 * Unit tests for src/lib/routes.ts
 * 
 * Tests route builders and validation utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  routes,
  auth,
  api,
  ROUTES,
  API_ROUTES,
  AUTH_ROUTES,
  isDraftId,
  isExternalUrl,
  normalizePath,
  joinPath,
  encodePathSegment,
  buildPublicPath,
  parseUsername,
  isValidUsername,
  getUsernameError,
  RESERVED_PATHS,
} from '@/lib/routes';

describe('Routes Module', () => {
  describe('Route Constants', () => {
    it('ROUTES.HOME is /', () => {
      expect(ROUTES.HOME).toBe('/');
    });

    it('ROUTES.EDIT is /edit', () => {
      expect(ROUTES.EDIT).toBe('/edit');
    });

    it('API_ROUTES.ME is /api/me', () => {
      expect(API_ROUTES.ME).toBe('/api/me');
    });

    it('AUTH_ROUTES.GOOGLE is /api/auth/google', () => {
      expect(AUTH_ROUTES.GOOGLE).toBe('/api/auth/google');
    });
  });

  describe('Route Builders', () => {
    it('routes.home() returns /', () => {
      expect(routes.home()).toBe('/');
    });

    it('routes.home() with fresh option returns /?fresh=1', () => {
      expect(routes.home({ fresh: true })).toBe('/?fresh=1');
    });

    it('routes.edit() returns /edit', () => {
      expect(routes.edit()).toBe('/edit');
    });

    it('routes.edit() with fresh option returns /edit?fresh=1', () => {
      expect(routes.edit({ fresh: true })).toBe('/edit?fresh=1');
    });

    it('routes.user() returns /{username} (root level)', () => {
      expect(routes.user('johndoe')).toBe('/johndoe');
    });

    it('routes.user() lowercases username', () => {
      expect(routes.user('JohnDoe')).toBe('/johndoe');
    });
  });

  describe('Auth Routes', () => {
    it('auth.google() without returnTo', () => {
      expect(auth.google()).toBe('/api/auth/google');
    });

    it('auth.google() with returnTo', () => {
      expect(auth.google('/edit')).toBe('/api/auth/google?returnTo=%2Fedit');
    });

    it('auth.logout() returns /api/auth/logout', () => {
      expect(auth.logout()).toBe('/api/auth/logout');
    });

    it('auth.status() returns /api/me', () => {
      expect(auth.status()).toBe('/api/me');
    });
  });

  describe('API Routes', () => {
    it('api.me() returns /api/me', () => {
      expect(api.me()).toBe('/api/me');
    });

    it('api.publish() returns /api/publish', () => {
      expect(api.publish()).toBe('/api/publish');
    });

    it('api.upload() returns /api/upload', () => {
      expect(api.upload()).toBe('/api/upload');
    });

    it('api.health() returns /api/healthz', () => {
      expect(api.health()).toBe('/api/healthz');
    });
  });

  describe('Utility Functions', () => {
    it('isDraftId() returns true for draft_xxx', () => {
      expect(isDraftId('draft_123_abc')).toBe(true);
    });

    it('isDraftId() returns false for regular IDs', () => {
      expect(isDraftId('abc123')).toBe(false);
    });

    it('isExternalUrl() returns false for relative paths', () => {
      expect(isExternalUrl('/edit')).toBe(false);
      expect(isExternalUrl('#anchor')).toBe(false);
      expect(isExternalUrl('?query=1')).toBe(false);
    });

    it('isExternalUrl() returns true for absolute URLs', () => {
      expect(isExternalUrl('https://example.com')).toBe(true);
      expect(isExternalUrl('http://example.com')).toBe(true);
      expect(isExternalUrl('//example.com')).toBe(true);
    });

    it('normalizePath() removes trailing slash', () => {
      expect(normalizePath('/edit/')).toBe('/edit');
    });

    it('normalizePath() keeps root slash', () => {
      expect(normalizePath('/')).toBe('/');
    });

    it('normalizePath() lowercases path', () => {
      expect(normalizePath('/Edit/Page123')).toBe('/edit/page123');
    });

    it('normalizePath() removes duplicate slashes', () => {
      expect(normalizePath('/edit//page///123')).toBe('/edit/page/123');
    });

    it('joinPath() joins segments correctly', () => {
      expect(joinPath('/edit', 'page123')).toBe('/edit/page123');
      expect(joinPath('edit', 'page123')).toBe('/edit/page123');
      expect(joinPath('/edit/', '/page123/')).toBe('/edit/page123');
    });

    it('encodePathSegment() encodes special characters', () => {
      expect(encodePathSegment('hello world')).toBe('hello%20world');
      expect(encodePathSegment('user/name')).toBe('user%2Fname');
    });
  });

  describe('Username Validation', () => {
    it('isValidUsername() validates correct usernames', () => {
      expect(isValidUsername('johndoe')).toBe(true);
      expect(isValidUsername('john_doe_123')).toBe(true);
      expect(isValidUsername('john-doe')).toBe(true);
      expect(isValidUsername('abc')).toBe(true);
      expect(isValidUsername('12345678901234567890')).toBe(true);
    });

    it('isValidUsername() rejects invalid usernames', () => {
      expect(isValidUsername('ab')).toBe(false); // too short
      expect(isValidUsername('a'.repeat(21))).toBe(false); // too long
      expect(isValidUsername('John')).toBe(false); // uppercase
      expect(isValidUsername('john doe')).toBe(false); // space
      expect(isValidUsername('john@doe')).toBe(false); // special char
    });

    it('isValidUsername() rejects reserved usernames', () => {
      expect(isValidUsername('admin')).toBe(false);
      expect(isValidUsername('api')).toBe(false);
      expect(isValidUsername('edit')).toBe(false);
      expect(isValidUsername('login')).toBe(false);
    });

    it('getUsernameError() returns null for valid usernames', () => {
      expect(getUsernameError('johndoe')).toBeNull();
      expect(getUsernameError('john_doe')).toBeNull();
    });

    it('getUsernameError() returns error for invalid usernames', () => {
      expect(getUsernameError('ab')).not.toBeNull();
      expect(getUsernameError('edit')).not.toBeNull();
      expect(getUsernameError('')).not.toBeNull();
    });
  });

  describe('Server-side Helpers', () => {
    it('buildPublicPath() returns /{username}', () => {
      expect(buildPublicPath('johndoe')).toBe('/johndoe');
    });
  });

  describe('Parse Helpers', () => {
    it('parseUsername() extracts username from root URL', () => {
      expect(parseUsername('/johndoe')).toBe('johndoe');
      expect(parseUsername('/john_doe')).toBe('john_doe');
    });

    it('parseUsername() returns null for reserved paths', () => {
      expect(parseUsername('/edit')).toBeNull();
      expect(parseUsername('/api')).toBeNull();
      expect(parseUsername('/auth')).toBeNull();
      expect(parseUsername('/graphql')).toBeNull();
    });

    it('parseUsername() returns null for invalid paths', () => {
      expect(parseUsername('/')).toBeNull();
      expect(parseUsername('')).toBeNull();
    });
  });

  describe('Reserved Paths', () => {
    it('RESERVED_PATHS contains expected values', () => {
      expect(RESERVED_PATHS.has('api')).toBe(true);
      expect(RESERVED_PATHS.has('edit')).toBe(true);
      expect(RESERVED_PATHS.has('new')).toBe(true);
      expect(RESERVED_PATHS.has('auth')).toBe(true);
    });
  });
});

