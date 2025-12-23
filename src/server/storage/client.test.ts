/**
 * Tests for storage client and publish configuration.
 * 
 * Run with: npx ts-node --project tsconfig.server.json src/server/storage/client.test.ts
 */

import {
  isValidSlug,
  isPublicPagesConfigured,
  isUploadConfigured,
  requirePublicPagesConfigured,
  getPublicBaseUrl,
  generateBaseSlug,
} from './client';

// =============================================================================
// Test Utilities
// =============================================================================

let passCount = 0;
let failCount = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passCount++;
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   ${error instanceof Error ? error.message : error}`);
    failCount++;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// =============================================================================
// Slug Validation Tests
// =============================================================================

console.log('\n📋 Slug Validation Tests\n');

test('isValidSlug accepts lowercase alphanumeric with hyphens', () => {
  assert(isValidSlug('user-abc123'), 'Should accept user-abc123');
  assert(isValidSlug('a'), 'Should accept single char');
  assert(isValidSlug('my-page-123'), 'Should accept hyphens');
  assert(isValidSlug('user-a1b2c3d4'), 'Should accept 8-char suffix');
});

test('isValidSlug rejects invalid slugs', () => {
  assert(!isValidSlug(''), 'Should reject empty string');
  assert(!isValidSlug('User-ABC'), 'Should reject uppercase');
  assert(!isValidSlug('user_name'), 'Should reject underscores');
  assert(!isValidSlug('user name'), 'Should reject spaces');
  assert(!isValidSlug('a'.repeat(65)), 'Should reject slugs > 64 chars');
  assert(!isValidSlug('user@name'), 'Should reject special chars');
});

// =============================================================================
// Slug Generation Tests (userId-based, never username)
// =============================================================================

console.log('\n📋 Slug Generation Tests\n');

test('generateBaseSlug uses userId, not username', () => {
  const userId = 'abc12345-6789-0123-4567-890123456789';
  const slug = generateBaseSlug(userId);
  assertEqual(slug, 'user-abc12345', 'Slug should be user-{first 8 chars of userId}');
});

test('generateBaseSlug handles short userId', () => {
  const userId = 'ab12';
  const slug = generateBaseSlug(userId);
  assertEqual(slug, 'user-ab12', 'Slug should handle short userId');
});

test('generateBaseSlug lowercases userId', () => {
  const userId = 'ABC12345';
  const slug = generateBaseSlug(userId);
  assertEqual(slug, 'user-abc12345', 'Slug should be lowercase');
});

test('generateBaseSlug never includes username string', () => {
  // Verify the function signature doesn't accept username
  const userId = 'abc12345';
  const slug = generateBaseSlug(userId);
  
  // The slug should not contain anything that looks like a username
  assert(!slug.includes('@'), 'Slug should not contain @ symbol');
  assert(slug.startsWith('user-'), 'Slug should start with user-');
  assert(slug === `user-${userId.slice(0, 8).toLowerCase()}`, 'Slug must be deterministic from userId');
});

// =============================================================================
// Configuration Tests
// =============================================================================

console.log('\n📋 Configuration Tests\n');

// Save original env (only the vars we'll modify)
const originalEnv = {
  S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL,
  PUBLIC_PAGES_BASE_URL: process.env.PUBLIC_PAGES_BASE_URL,
  S3_ENDPOINT: process.env.S3_ENDPOINT,
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
  S3_BUCKET: process.env.S3_BUCKET,
  NODE_ENV: process.env.NODE_ENV,
};

function resetEnv() {
  // In Node.js, setting to undefined converts to "undefined" string
  // We need to delete the property to actually unset it
  delete (process.env as Record<string, unknown>).S3_PUBLIC_BASE_URL;
  delete (process.env as Record<string, unknown>).PUBLIC_PAGES_BASE_URL;
  delete (process.env as Record<string, unknown>).S3_ENDPOINT;
  delete (process.env as Record<string, unknown>).S3_ACCESS_KEY_ID;
  delete (process.env as Record<string, unknown>).S3_SECRET_ACCESS_KEY;
  delete (process.env as Record<string, unknown>).S3_BUCKET;
  delete (process.env as Record<string, unknown>).NODE_ENV;
}

function restoreEnv() {
  // Restore original values
  const env = process.env as Record<string, string | undefined>;
  if (originalEnv.S3_PUBLIC_BASE_URL !== undefined) {
    env.S3_PUBLIC_BASE_URL = originalEnv.S3_PUBLIC_BASE_URL;
  }
  if (originalEnv.PUBLIC_PAGES_BASE_URL !== undefined) {
    env.PUBLIC_PAGES_BASE_URL = originalEnv.PUBLIC_PAGES_BASE_URL;
  }
  if (originalEnv.S3_ENDPOINT !== undefined) {
    env.S3_ENDPOINT = originalEnv.S3_ENDPOINT;
  }
  if (originalEnv.S3_ACCESS_KEY_ID !== undefined) {
    env.S3_ACCESS_KEY_ID = originalEnv.S3_ACCESS_KEY_ID;
  }
  if (originalEnv.S3_SECRET_ACCESS_KEY !== undefined) {
    env.S3_SECRET_ACCESS_KEY = originalEnv.S3_SECRET_ACCESS_KEY;
  }
  if (originalEnv.S3_BUCKET !== undefined) {
    env.S3_BUCKET = originalEnv.S3_BUCKET;
  }
  if (originalEnv.NODE_ENV !== undefined) {
    env.NODE_ENV = originalEnv.NODE_ENV;
  }
}

test('isPublicPagesConfigured returns false when no URL configured', () => {
  resetEnv();
  assert(!isPublicPagesConfigured(), 'Should be false without S3_PUBLIC_BASE_URL');
  restoreEnv();
});

test('isPublicPagesConfigured returns true with S3_PUBLIC_BASE_URL', () => {
  resetEnv();
  process.env.S3_PUBLIC_BASE_URL = 'https://cdn.example.com';
  assert(isPublicPagesConfigured(), 'Should be true with S3_PUBLIC_BASE_URL');
  restoreEnv();
});

test('isPublicPagesConfigured returns true with PUBLIC_PAGES_BASE_URL', () => {
  resetEnv();
  process.env.PUBLIC_PAGES_BASE_URL = 'https://cdn.example.com';
  assert(isPublicPagesConfigured(), 'Should be true with PUBLIC_PAGES_BASE_URL');
  restoreEnv();
});

test('isUploadConfigured requires all credentials', () => {
  resetEnv();
  process.env.S3_PUBLIC_BASE_URL = 'https://cdn.example.com';
  assert(!isUploadConfigured(), 'Should be false without all credentials');
  
  process.env.S3_ENDPOINT = 'https://s3.example.com';
  assert(!isUploadConfigured(), 'Should be false without access key');
  
  process.env.S3_ACCESS_KEY_ID = 'key123';
  assert(!isUploadConfigured(), 'Should be false without secret');
  
  process.env.S3_SECRET_ACCESS_KEY = 'secret123';
  assert(!isUploadConfigured(), 'Should be false without bucket');
  
  process.env.S3_BUCKET = 'mybucket';
  assert(isUploadConfigured(), 'Should be true with all credentials');
  
  restoreEnv();
});

test('requirePublicPagesConfigured returns error in production without URL', () => {
  resetEnv();
  process.env.NODE_ENV = 'production';
  
  const error = requirePublicPagesConfigured();
  assert(error !== null, 'Should return error in production without URL');
  assert(error!.includes('S3_PUBLIC_BASE_URL'), 'Error should mention S3_PUBLIC_BASE_URL');
  
  restoreEnv();
});

test('requirePublicPagesConfigured returns null in production with URL', () => {
  resetEnv();
  process.env.NODE_ENV = 'production';
  process.env.S3_PUBLIC_BASE_URL = 'https://cdn.example.com';
  
  const error = requirePublicPagesConfigured();
  assert(error === null, 'Should return null in production with URL');
  
  restoreEnv();
});

test('requirePublicPagesConfigured returns null in development without URL', () => {
  resetEnv();
  process.env.NODE_ENV = 'development';
  
  const error = requirePublicPagesConfigured();
  assert(error === null, 'Should return null in development');
  
  restoreEnv();
});

test('getPublicBaseUrl prefers S3_PUBLIC_BASE_URL over PUBLIC_PAGES_BASE_URL', () => {
  resetEnv();
  process.env.S3_PUBLIC_BASE_URL = 'https://s3.example.com';
  process.env.PUBLIC_PAGES_BASE_URL = 'https://pages.example.com';
  
  assertEqual(getPublicBaseUrl(), 'https://s3.example.com', 'Should prefer S3_PUBLIC_BASE_URL');
  
  restoreEnv();
});

// =============================================================================
// Summary
// =============================================================================

console.log(`\n✨ Tests complete: ${passCount} passed, ${failCount} failed\n`);

// Exit with error code if tests failed
if (failCount > 0) {
  throw new Error(`${failCount} tests failed`);
}

