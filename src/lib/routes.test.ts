/**
 * Route builder tests.
 * 
 * Run with: npx ts-node --project tsconfig.server.json src/lib/routes.test.ts
 */

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
} from './routes';

// Simple test runner
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (error) {
    failed++;
    console.log(`❌ ${name}`);
    console.log(`   ${error instanceof Error ? error.message : error}`);
  }
}

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected "${expected}" but got "${actual}"`);
  }
}

function assertTrue(value: boolean, message?: string) {
  if (!value) {
    throw new Error(message || `Expected true but got false`);
  }
}

function assertFalse(value: boolean, message?: string) {
  if (value) {
    throw new Error(message || `Expected false but got true`);
  }
}

function assertNull(value: unknown, message?: string) {
  if (value !== null) {
    throw new Error(message || `Expected null but got "${value}"`);
  }
}

// =============================================================================
// Route Constants Tests
// =============================================================================

console.log('\n📌 Route Constants');

test('ROUTES.HOME is /', () => {
  assertEquals(ROUTES.HOME, '/');
});

test('ROUTES.EDIT is /edit', () => {
  assertEquals(ROUTES.EDIT, '/edit');
});

test('API_ROUTES.ME is /api/me', () => {
  assertEquals(API_ROUTES.ME, '/api/me');
});

test('AUTH_ROUTES.GOOGLE is /api/auth/google', () => {
  assertEquals(AUTH_ROUTES.GOOGLE, '/api/auth/google');
});

// =============================================================================
// Route Builder Tests
// =============================================================================

console.log('\n🔨 Route Builders');

test('routes.home() returns /', () => {
  assertEquals(routes.home(), '/');
});

test('routes.home() with fresh option returns /?fresh=1', () => {
  assertEquals(routes.home({ fresh: true }), '/?fresh=1');
});

test('routes.edit() returns /edit', () => {
  assertEquals(routes.edit(), '/edit');
});

test('routes.edit() with fresh option returns /edit?fresh=1', () => {
  assertEquals(routes.edit({ fresh: true }), '/edit?fresh=1');
});

test('routes.user() returns /{username} (root level)', () => {
  assertEquals(routes.user('johndoe'), '/johndoe');
});

test('routes.user() lowercases username', () => {
  assertEquals(routes.user('JohnDoe'), '/johndoe');
});

test('routes.profile() is alias for routes.user()', () => {
  assertEquals(routes.profile('johndoe'), '/johndoe');
});

// =============================================================================
// Auth Route Tests
// =============================================================================

console.log('\n🔐 Auth Routes');

test('auth.google() without returnTo', () => {
  assertEquals(auth.google(), '/api/auth/google');
});

test('auth.google() with returnTo', () => {
  assertEquals(auth.google('/edit'), '/api/auth/google?returnTo=%2Fedit');
});

test('auth.logout() returns /api/auth/logout', () => {
  assertEquals(auth.logout(), '/api/auth/logout');
});

test('auth.status() returns /api/me', () => {
  assertEquals(auth.status(), '/api/me');
});

// =============================================================================
// API Route Tests
// =============================================================================

console.log('\n📡 API Routes');

test('api.me() returns /api/me', () => {
  assertEquals(api.me(), '/api/me');
});

test('api.publish() returns /api/publish', () => {
  assertEquals(api.publish(), '/api/publish');
});

test('api.upload() returns /api/upload', () => {
  assertEquals(api.upload(), '/api/upload');
});

test('api.health() returns /api/healthz', () => {
  assertEquals(api.health(), '/api/healthz');
});

// =============================================================================
// Utility Function Tests
// =============================================================================

console.log('\n🛠️ Utility Functions');

test('isDraftId() returns true for draft_xxx', () => {
  assertTrue(isDraftId('draft_123_abc'));
});

test('isDraftId() returns false for regular IDs', () => {
  assertFalse(isDraftId('abc123'));
});

test('isExternalUrl() returns false for relative paths', () => {
  assertFalse(isExternalUrl('/edit'));
  assertFalse(isExternalUrl('#anchor'));
  assertFalse(isExternalUrl('?query=1'));
});

test('isExternalUrl() returns true for absolute URLs', () => {
  assertTrue(isExternalUrl('https://example.com'));
  assertTrue(isExternalUrl('http://example.com'));
  assertTrue(isExternalUrl('//example.com'));
});

test('normalizePath() removes trailing slash', () => {
  assertEquals(normalizePath('/edit/'), '/edit');
});

test('normalizePath() keeps root slash', () => {
  assertEquals(normalizePath('/'), '/');
});

test('normalizePath() lowercases path', () => {
  assertEquals(normalizePath('/Edit/Page123'), '/edit/page123');
});

test('normalizePath() removes duplicate slashes', () => {
  assertEquals(normalizePath('/edit//page///123'), '/edit/page/123');
});

test('normalizePath() preserves query string casing', () => {
  assertEquals(normalizePath('/Edit?Name=John'), '/edit?Name=John');
});

test('joinPath() joins segments correctly', () => {
  assertEquals(joinPath('/edit', 'page123'), '/edit/page123');
  assertEquals(joinPath('edit', 'page123'), '/edit/page123');
  assertEquals(joinPath('/edit/', '/page123/'), '/edit/page123');
});

test('encodePathSegment() encodes special characters', () => {
  assertEquals(encodePathSegment('hello world'), 'hello%20world');
  assertEquals(encodePathSegment('user/name'), 'user%2Fname');
});

// =============================================================================
// Username Validation Tests
// =============================================================================

console.log('\n👤 Username Validation');

test('isValidUsername() validates correct usernames', () => {
  assertTrue(isValidUsername('johndoe'));
  assertTrue(isValidUsername('john_doe_123'));
  assertTrue(isValidUsername('john-doe')); // hyphens allowed
  assertTrue(isValidUsername('abc'));
  assertTrue(isValidUsername('12345678901234567890')); // 20 chars
});

test('isValidUsername() rejects invalid usernames', () => {
  assertFalse(isValidUsername('ab')); // too short
  assertFalse(isValidUsername('a'.repeat(21))); // too long
  assertFalse(isValidUsername('John')); // uppercase
  assertFalse(isValidUsername('john doe')); // space
  assertFalse(isValidUsername('john@doe')); // special char
});

test('isValidUsername() rejects reserved usernames', () => {
  assertFalse(isValidUsername('admin'));
  assertFalse(isValidUsername('api'));
  assertFalse(isValidUsername('edit'));
  assertFalse(isValidUsername('login'));
  assertFalse(isValidUsername('null'));
});

test('getUsernameError() returns null for valid usernames', () => {
  assertNull(getUsernameError('johndoe'));
  assertNull(getUsernameError('john_doe'));
});

test('getUsernameError() returns error for invalid usernames', () => {
  assertTrue(getUsernameError('ab') !== null);
  assertTrue(getUsernameError('edit') !== null);
  assertTrue(getUsernameError('') !== null);
});

// =============================================================================
// Server-side Helper Tests
// =============================================================================

console.log('\n🖥️ Server-side Helpers');

test('buildPublicPath() returns /{username}', () => {
  assertEquals(buildPublicPath('johndoe'), '/johndoe');
});

// =============================================================================
// Parse Helper Tests
// =============================================================================

console.log('\n📝 Parse Helpers');

test('parseUsername() extracts username from root URL', () => {
  assertEquals(parseUsername('/johndoe'), 'johndoe');
  assertEquals(parseUsername('/john_doe'), 'john_doe');
});

test('parseUsername() returns null for reserved paths', () => {
  assertEquals(parseUsername('/edit'), null);
  assertEquals(parseUsername('/api'), null);
  assertEquals(parseUsername('/auth'), null);
  assertEquals(parseUsername('/graphql'), null);
});

test('parseUsername() returns null for invalid paths', () => {
  assertEquals(parseUsername('/'), null);
  assertEquals(parseUsername(''), null);
});

// =============================================================================
// Summary
// =============================================================================

console.log('\n' + '='.repeat(50));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
