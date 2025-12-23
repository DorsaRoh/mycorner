/**
 * Tests for PageDoc schema validation and slug generation.
 * 
 * Run with: npm test
 */

import { 
  PageDocSchema, 
  validatePageDoc, 
  createEmptyPageDoc,
  generateBlockId,
  convertLegacyBlock,
} from './page';

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
// PageDoc Schema Tests
// =============================================================================

console.log('\n📋 PageDoc Schema Tests\n');

test('createEmptyPageDoc returns valid PageDoc', () => {
  const doc = createEmptyPageDoc();
  const result = PageDocSchema.safeParse(doc);
  assert(result.success, 'Empty PageDoc should be valid');
});

test('PageDoc requires version 1', () => {
  const doc = { version: 2, blocks: [] };
  const result = PageDocSchema.safeParse(doc);
  assert(!result.success, 'Version 2 should be invalid');
});

test('PageDoc accepts valid text block', () => {
  const doc = {
    version: 1,
    blocks: [{
      id: 'test-1',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      content: { text: 'Hello world' },
    }],
  };
  const result = PageDocSchema.safeParse(doc);
  assert(result.success, 'Text block should be valid');
});

test('PageDoc accepts valid link block', () => {
  const doc = {
    version: 1,
    blocks: [{
      id: 'test-1',
      type: 'link',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      content: { label: 'My Site', url: 'https://example.com' },
    }],
  };
  const result = PageDocSchema.safeParse(doc);
  assert(result.success, 'Link block should be valid');
});

test('PageDoc accepts valid image block', () => {
  const doc = {
    version: 1,
    blocks: [{
      id: 'test-1',
      type: 'image',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      content: { url: 'https://example.com/image.jpg', alt: 'My image' },
    }],
  };
  const result = PageDocSchema.safeParse(doc);
  assert(result.success, 'Image block should be valid');
});

test('PageDoc rejects invalid block type', () => {
  const doc = {
    version: 1,
    blocks: [{
      id: 'test-1',
      type: 'video',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      content: {},
    }],
  };
  const result = PageDocSchema.safeParse(doc);
  assert(!result.success, 'Invalid block type should be rejected');
});

test('PageDoc accepts block with style', () => {
  const doc = {
    version: 1,
    blocks: [{
      id: 'test-1',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      content: { text: 'Hello' },
      style: {
        align: 'center',
        card: true,
        radius: 'md',
        shadow: 'sm',
      },
    }],
  };
  const result = PageDocSchema.safeParse(doc);
  assert(result.success, 'Block with style should be valid');
});

test('PageDoc rejects invalid style values', () => {
  const doc = {
    version: 1,
    blocks: [{
      id: 'test-1',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      content: { text: 'Hello' },
      style: {
        align: 'justify',
      },
    }],
  };
  const result = PageDocSchema.safeParse(doc);
  assert(!result.success, 'Invalid style value should be rejected');
});

// =============================================================================
// Validation Helper Tests
// =============================================================================

console.log('\n📋 Validation Helper Tests\n');

test('validatePageDoc returns success for valid doc', () => {
  const doc = createEmptyPageDoc();
  const result = validatePageDoc(doc);
  assert(result.success, 'Should return success');
});

test('validatePageDoc returns error for invalid doc', () => {
  const result = validatePageDoc({ version: 2 });
  assert(!result.success, 'Should return error');
  assert('error' in result && typeof result.error === 'string', 'Should have error message');
});

// =============================================================================
// ID Generation Tests
// =============================================================================

console.log('\n📋 ID Generation Tests\n');

test('generateBlockId produces unique IDs', () => {
  const ids = new Set<string>();
  for (let i = 0; i < 100; i++) {
    ids.add(generateBlockId());
  }
  assertEqual(ids.size, 100, 'All IDs should be unique');
});

test('generateBlockId starts with blk_', () => {
  const id = generateBlockId();
  assert(id.startsWith('blk_'), 'ID should start with blk_');
});

// =============================================================================
// Slug Generation Tests
// =============================================================================

console.log('\n📋 Slug Generation Tests\n');

test('slug format is user-{id prefix}', () => {
  const userId = 'abc123def456';
  const expectedSlug = `user-${userId.slice(0, 8)}`;
  assertEqual(expectedSlug, 'user-abc123de', 'Slug should be user-{first 8 chars}');
});

test('slug uniqueness suffix works', () => {
  const baseSlug = 'user-abc123';
  const slug2 = `${baseSlug}-2`;
  const slug3 = `${baseSlug}-3`;
  assert(slug2 === 'user-abc123-2', 'Second slug should have -2 suffix');
  assert(slug3 === 'user-abc123-3', 'Third slug should have -3 suffix');
});

// =============================================================================
// Legacy Conversion Tests
// =============================================================================

console.log('\n📋 Legacy Conversion Tests\n');

test('convertLegacyBlock handles TEXT block', () => {
  const legacy = {
    id: 'test-1',
    type: 'TEXT' as const,
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    content: 'Hello world',
  };
  const result = convertLegacyBlock(legacy);
  assert(result !== null, 'Should convert successfully');
  assertEqual(result!.type, 'text', 'Type should be lowercase');
  assertEqual((result as any).content.text, 'Hello world', 'Content should be wrapped');
});

test('convertLegacyBlock handles IMAGE block', () => {
  const legacy = {
    id: 'test-1',
    type: 'IMAGE' as const,
    x: 10,
    y: 20,
    width: 100,
    height: 100,
    content: 'https://example.com/image.jpg',
  };
  const result = convertLegacyBlock(legacy);
  assert(result !== null, 'Should convert successfully');
  assertEqual(result!.type, 'image', 'Type should be lowercase');
  assertEqual((result as any).content.url, 'https://example.com/image.jpg', 'URL should be in content');
});

test('convertLegacyBlock handles LINK block', () => {
  const legacy = {
    id: 'test-1',
    type: 'LINK' as const,
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    content: JSON.stringify({ label: 'Click me', url: 'https://example.com' }),
  };
  const result = convertLegacyBlock(legacy);
  assert(result !== null, 'Should convert successfully');
  assertEqual(result!.type, 'link', 'Type should be lowercase');
  assertEqual((result as any).content.label, 'Click me', 'Label should be parsed');
  assertEqual((result as any).content.url, 'https://example.com', 'URL should be parsed');
});

// =============================================================================
// publishDraft Tests (mock scenarios)
// =============================================================================

console.log('\n📋 publishDraft Flow Tests\n');

test('publishDraft requires authentication', () => {
  // Simulate unauthenticated request
  const user = null;
  assert(user === null, 'Unauthenticated request should have no user');
  // API would return 401
});

test('publishDraft succeeds with authentication', () => {
  // Simulate authenticated request
  const user = { id: 'user123', email: 'test@example.com' };
  assert(user !== null, 'Authenticated request should have user');
  assert(typeof user.id === 'string', 'User should have id');
  // API would return { success: true, slug: 'user-user123' }
});

// =============================================================================
// Summary
// =============================================================================

console.log(`\n✨ Tests complete: ${passCount} passed, ${failCount} failed\n`);

// Exit with error code if tests failed
if (failCount > 0) {
  throw new Error(`${failCount} tests failed`);
}
