/**
 * Tests for public page rendering - verifies that:
 * 1. PageDoc blocks are correctly converted to legacy format
 * 2. Legacy blocks produce valid render data (non-zero dimensions)
 * 3. Canvas dimensions never produce scale=0
 * 
 * Run with: npx tsx src/lib/canvas/publicPageRender.test.ts
 */

import type { Block as LegacyBlock } from '@/shared/types';
import type { PageDoc, Block as PageDocBlock } from '@/lib/schema/page';
import { getCanvasDimensions, refToPx, REFERENCE_WIDTH, REFERENCE_HEIGHT } from './coordinates';

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
// Mock Conversion Functions (from PublicPageView)
// =============================================================================

function convertToLegacyBlocks(pageDocBlocks: PageDocBlock[]): LegacyBlock[] {
  return pageDocBlocks.map((block): LegacyBlock => {
    const base = {
      id: block.id,
      x: block.x,
      y: block.y,
      width: block.width,
      height: block.height,
      rotation: block.rotation,
    };

    switch (block.type) {
      case 'text':
        return {
          ...base,
          type: 'TEXT',
          content: block.content.text,
        };
      case 'image':
        return {
          ...base,
          type: 'IMAGE',
          content: block.content.url,
        };
      case 'link':
        return {
          ...base,
          type: 'LINK',
          content: JSON.stringify({
            name: block.content.label,
            url: block.content.url,
          }),
        };
      default:
        return {
          ...base,
          type: 'TEXT',
          content: '',
        };
    }
  });
}

// =============================================================================
// Test Data
// =============================================================================

const samplePageDoc: PageDoc = {
  version: 1,
  title: 'Test Page',
  bio: 'A test bio',
  themeId: 'default',
  blocks: [
    {
      id: 'text-1',
      type: 'text',
      x: 50,
      y: 100,
      width: 400,
      height: 60,
      content: { text: 'Hello, World!' },
    },
    {
      id: 'image-1',
      type: 'image',
      x: 50,
      y: 200,
      width: 300,
      height: 200,
      content: { url: 'https://example.com/image.jpg', alt: 'Test image' },
    },
    {
      id: 'link-1',
      type: 'link',
      x: 50,
      y: 450,
      width: 200,
      height: 40,
      content: { label: 'Visit Example', url: 'https://example.com' },
    },
  ],
};

// =============================================================================
// Canvas Dimension Tests
// =============================================================================

console.log('\n📋 Canvas Dimension Tests\n');

test('getCanvasDimensions never returns scale=0', () => {
  // Test with zero dimensions (SSR or before layout)
  const dims = getCanvasDimensions(0, 0);
  assert(dims.scale > 0, `Scale should be > 0, got ${dims.scale}`);
  assert(dims.width > 0, `Width should be > 0, got ${dims.width}`);
  assert(dims.height > 0, `Height should be > 0, got ${dims.height}`);
});

test('getCanvasDimensions handles very small container', () => {
  const dims = getCanvasDimensions(10, 10);
  assert(dims.scale >= 0.1, `Scale should be >= 0.1, got ${dims.scale}`);
});

test('getCanvasDimensions handles normal desktop size', () => {
  const dims = getCanvasDimensions(1440, 900);
  assert(dims.scale === 1, `Scale should be 1 for 1440px width, got ${dims.scale}`);
  assertEqual(dims.offsetX, 120, 'offsetX should center content (1440-1200)/2');
});

test('getCanvasDimensions handles mobile size', () => {
  const dims = getCanvasDimensions(390, 844);
  assert(dims.scale > 0.3 && dims.scale < 1, `Scale should be between 0.3 and 1 for mobile, got ${dims.scale}`);
  assertEqual(dims.offsetX, 0, 'offsetX should be 0 for mobile (no side margins)');
});

// =============================================================================
// Block Conversion Tests
// =============================================================================

console.log('\n📋 Block Conversion Tests\n');

test('convertToLegacyBlocks produces at least one TEXT block', () => {
  const legacyBlocks = convertToLegacyBlocks(samplePageDoc.blocks);
  const textBlocks = legacyBlocks.filter(b => b.type === 'TEXT');
  assert(textBlocks.length >= 1, 'Should have at least one TEXT block');
  assert(textBlocks[0].content.length > 0, 'TEXT block should have non-empty content');
});

test('convertToLegacyBlocks produces at least one IMAGE block', () => {
  const legacyBlocks = convertToLegacyBlocks(samplePageDoc.blocks);
  const imageBlocks = legacyBlocks.filter(b => b.type === 'IMAGE');
  assert(imageBlocks.length >= 1, 'Should have at least one IMAGE block');
  assert(imageBlocks[0].content.startsWith('http'), 'IMAGE block content should be a valid URL');
});

test('convertToLegacyBlocks produces valid LINK block', () => {
  const legacyBlocks = convertToLegacyBlocks(samplePageDoc.blocks);
  const linkBlocks = legacyBlocks.filter(b => b.type === 'LINK');
  assert(linkBlocks.length >= 1, 'Should have at least one LINK block');
  
  // Verify link content is valid JSON
  const parsed = JSON.parse(linkBlocks[0].content);
  assert(typeof parsed.url === 'string', 'LINK block should have url property');
  assert(parsed.url.startsWith('http'), 'LINK url should be valid');
});

test('convertToLegacyBlocks preserves block dimensions', () => {
  const legacyBlocks = convertToLegacyBlocks(samplePageDoc.blocks);
  
  for (const block of legacyBlocks) {
    assert(block.width > 0, `Block ${block.id} should have width > 0`);
    assert(block.height > 0, `Block ${block.id} should have height > 0`);
    assert(typeof block.x === 'number', `Block ${block.id} should have numeric x`);
    assert(typeof block.y === 'number', `Block ${block.id} should have numeric y`);
  }
});

test('convertToLegacyBlocks handles type correctly', () => {
  const legacyBlocks = convertToLegacyBlocks(samplePageDoc.blocks);
  
  for (const block of legacyBlocks) {
    assert(
      block.type === 'TEXT' || block.type === 'IMAGE' || block.type === 'LINK',
      `Block type should be uppercase: ${block.type}`
    );
  }
});

// =============================================================================
// Pixel Coordinate Tests
// =============================================================================

console.log('\n📋 Pixel Coordinate Tests\n');

test('refToPx produces non-zero dimensions with default scale', () => {
  const dims = getCanvasDimensions(REFERENCE_WIDTH, REFERENCE_HEIGHT);
  const block = { x: 100, y: 100, width: 200, height: 100 };
  const pxRect = refToPx(block, dims);
  
  assert(pxRect.width > 0, `Pixel width should be > 0, got ${pxRect.width}`);
  assert(pxRect.height > 0, `Pixel height should be > 0, got ${pxRect.height}`);
});

test('refToPx produces valid dimensions with mobile scale', () => {
  const dims = getCanvasDimensions(390, 844);
  const block = { x: 100, y: 100, width: 200, height: 100 };
  const pxRect = refToPx(block, dims);
  
  assert(pxRect.width > 0, `Pixel width should be > 0, got ${pxRect.width}`);
  assert(pxRect.height > 0, `Pixel height should be > 0, got ${pxRect.height}`);
  assert(pxRect.width < block.width, 'Pixel width should be smaller than reference at mobile scale');
});

test('refToPx never produces NaN values', () => {
  const dims = getCanvasDimensions(0, 0); // Edge case
  const block = { x: 100, y: 100, width: 200, height: 100 };
  const pxRect = refToPx(block, dims);
  
  assert(!isNaN(pxRect.x), 'x should not be NaN');
  assert(!isNaN(pxRect.y), 'y should not be NaN');
  assert(!isNaN(pxRect.width), 'width should not be NaN');
  assert(!isNaN(pxRect.height), 'height should not be NaN');
});

// =============================================================================
// End-to-End Render Data Test
// =============================================================================

console.log('\n📋 End-to-End Render Data Tests\n');

test('full render pipeline produces valid block data', () => {
  // Simulate what happens in PublicPageView → ViewerCanvas → ViewerBlock
  const legacyBlocks = convertToLegacyBlocks(samplePageDoc.blocks);
  const dims = getCanvasDimensions(1024, 768); // Typical desktop
  
  for (const block of legacyBlocks) {
    const pxRect = refToPx(
      { x: block.x, y: block.y, width: block.width, height: block.height },
      dims
    );
    
    // All blocks should have positive dimensions
    assert(pxRect.width > 0, `Block ${block.id} should have positive width`);
    assert(pxRect.height > 0, `Block ${block.id} should have positive height`);
    
    // Blocks should be within reasonable viewport bounds
    assert(pxRect.x >= 0 || pxRect.x > -pxRect.width, `Block ${block.id} x should be on screen`);
    assert(pxRect.y >= 0, `Block ${block.id} y should be non-negative`);
  }
});

test('render pipeline works with edge case container sizes', () => {
  const legacyBlocks = convertToLegacyBlocks(samplePageDoc.blocks);
  
  // Test various container sizes
  const sizes = [
    [0, 0],      // SSR / no layout yet
    [320, 568],  // Small mobile
    [768, 1024], // Tablet
    [1920, 1080], // Full HD
    [2560, 1440], // QHD
  ];
  
  for (const [width, height] of sizes) {
    const dims = getCanvasDimensions(width, height);
    
    // Scale should always be positive
    assert(dims.scale > 0, `Scale should be > 0 for ${width}x${height}`);
    
    for (const block of legacyBlocks) {
      const pxRect = refToPx(
        { x: block.x, y: block.y, width: block.width, height: block.height },
        dims
      );
      
      // Width and height should always be positive
      assert(pxRect.width > 0, `Block width should be > 0 at ${width}x${height}`);
      assert(pxRect.height > 0, `Block height should be > 0 at ${width}x${height}`);
    }
  }
});

// =============================================================================
// Summary
// =============================================================================

console.log(`\n✨ Tests complete: ${passCount} passed, ${failCount} failed\n`);

// Exit with error code if tests failed
if (failCount > 0) {
  throw new Error(`${failCount} tests failed`);
}

