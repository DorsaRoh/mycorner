/**
 * Tests for static HTML renderer.
 * 
 * Run with: npx ts-node --project tsconfig.server.json src/server/render/renderPageHtml.test.ts
 */

import { renderPageHtml, estimateHtmlSize } from './renderPageHtml';
import type { PageDoc } from '../../lib/schema/page';

// =============================================================================
// Test Helpers
// =============================================================================

function createTestPageDoc(overrides: Partial<PageDoc> = {}): PageDoc {
  return {
    version: 1,
    title: 'Test Page',
    bio: 'A test bio',
    themeId: 'default',
    blocks: [],
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

// =============================================================================
// Tests
// =============================================================================

const tests: Array<{ name: string; fn: () => void }> = [
  {
    name: 'renders basic page with title',
    fn: () => {
      const doc = createTestPageDoc({ title: 'My Page' });
      const html = renderPageHtml(doc);
      
      assert(html.includes('<!DOCTYPE html>'), 'Should include DOCTYPE');
      assert(html.includes('<title>My Page</title>'), 'Should include title tag');
      assert(html.includes('My Page'), 'Should include title text');
    },
  },
  {
    name: 'includes OG meta tags',
    fn: () => {
      const doc = createTestPageDoc({ 
        title: 'My Page',
        bio: 'This is my corner',
      });
      const html = renderPageHtml(doc);
      
      assert(html.includes('<meta property="og:title" content="My Page">'), 'Should include og:title');
      assert(html.includes('<meta property="og:type" content="website">'), 'Should include og:type');
    },
  },
  {
    name: 'includes CTA link by default',
    fn: () => {
      const doc = createTestPageDoc();
      const html = renderPageHtml(doc);
      
      assert(html.includes('Make your own'), 'Should include CTA text');
      assert(html.includes('/new'), 'Should link to /new');
    },
  },
  {
    name: 'excludes CTA when includeCta is false',
    fn: () => {
      const doc = createTestPageDoc();
      const html = renderPageHtml(doc, { includeCta: false });
      
      // Check that the HTML element is not present (CSS will still have the class)
      assert(!html.includes('<div class="cta-container">'), 'Should not include CTA container element');
    },
  },
  {
    name: 'does not include footer (removed for performance)',
    fn: () => {
      const doc = createTestPageDoc();
      const html = renderPageHtml(doc);
      
      assert(!html.includes('<footer'), 'Should not include footer element');
    },
  },
  {
    name: 'renders text block',
    fn: () => {
      const doc = createTestPageDoc({
        blocks: [{
          id: 'text-1',
          type: 'text',
          x: 100,
          y: 100,
          width: 200,
          height: 50,
          content: { text: 'Hello World' },
        }],
      });
      const html = renderPageHtml(doc);
      
      assert(html.includes('Hello World'), 'Should include text content');
      assert(html.includes('block-text'), 'Should include block-text class');
    },
  },
  {
    name: 'escapes HTML in text blocks (XSS prevention)',
    fn: () => {
      const doc = createTestPageDoc({
        blocks: [{
          id: 'text-1',
          type: 'text',
          x: 100,
          y: 100,
          width: 200,
          height: 50,
          content: { text: '<script>alert("xss")</script>' },
        }],
      });
      const html = renderPageHtml(doc);
      
      assert(!html.includes('<script>alert'), 'Should not include raw script tag');
      assert(html.includes('&lt;script&gt;'), 'Should include escaped script tag');
    },
  },
  {
    name: 'renders link block with valid URL',
    fn: () => {
      const doc = createTestPageDoc({
        blocks: [{
          id: 'link-1',
          type: 'link',
          x: 100,
          y: 100,
          width: 200,
          height: 50,
          content: { label: 'Click Me', url: 'https://example.com' },
        }],
      });
      const html = renderPageHtml(doc);
      
      assert(html.includes('Click Me'), 'Should include link label');
      assert(html.includes('href="https://example.com"'), 'Should include href');
      assert(html.includes('target="_blank"'), 'Should open in new tab');
      assert(html.includes('rel="noopener noreferrer"'), 'Should have security rel');
    },
  },
  {
    name: 'rejects javascript: URLs in links (XSS prevention)',
    fn: () => {
      const doc = createTestPageDoc({
        blocks: [{
          id: 'link-1',
          type: 'link',
          x: 100,
          y: 100,
          width: 200,
          height: 50,
          content: { label: 'Bad Link', url: 'javascript:alert(1)' },
        }],
      });
      const html = renderPageHtml(doc);
      
      assert(html.includes('Bad Link'), 'Should include label');
      assert(!html.includes('javascript:'), 'Should not include javascript: URL');
      assert(html.includes('block-invalid'), 'Should mark as invalid block');
    },
  },
  {
    name: 'renders image block with relative URL',
    fn: () => {
      // use relative URL since absolute URLs are blocked without storage domain configured
      const doc = createTestPageDoc({
        blocks: [{
          id: 'img-1',
          type: 'image',
          x: 100,
          y: 100,
          width: 200,
          height: 150,
          content: { url: '/assets/image.png', alt: 'Test Image' },
        }],
      });
      const html = renderPageHtml(doc);
      
      assert(html.includes('src="/assets/image.png"'), 'Should include img src');
      assert(html.includes('alt="Test Image"'), 'Should include alt text');
      assert(html.includes('loading="lazy"'), 'Should use lazy loading');
    },
  },
  {
    name: 'includes CSP meta tag',
    fn: () => {
      const doc = createTestPageDoc();
      const html = renderPageHtml(doc);
      
      assert(html.includes('Content-Security-Policy'), 'Should include CSP');
      assert(html.includes("default-src 'self'"), 'Should have default-src self');
    },
  },
  {
    name: 'applies theme CSS variables',
    fn: () => {
      const doc = createTestPageDoc({ themeId: 'midnight' });
      const html = renderPageHtml(doc);
      
      assert(html.includes('--bg-primary:'), 'Should include bg-primary CSS var');
      assert(html.includes('--text-primary:'), 'Should include text-primary CSS var');
    },
  },
  {
    name: 'respects custom appOrigin for CTA link',
    fn: () => {
      const doc = createTestPageDoc();
      const html = renderPageHtml(doc, { appOrigin: 'https://custom.com' });
      
      assert(html.includes('https://custom.com/new'), 'Should use custom origin for CTA');
      // cta is text-only, no logo image
      assert(!html.includes('/logo.png'), 'CTA should be text-only, no logo');
    },
  },
  {
    name: 'estimateHtmlSize returns reasonable size for empty doc',
    fn: () => {
      const doc = createTestPageDoc({ blocks: [] });
      const size = estimateHtmlSize(doc);
      
      assert(size > 4000, 'Should be at least 4KB for base template');
      assert(size < 10000, 'Should be less than 10KB for empty doc');
    },
  },
  {
    name: 'estimateHtmlSize increases with text content',
    fn: () => {
      const emptyDoc = createTestPageDoc({ blocks: [] });
      const textDoc = createTestPageDoc({
        blocks: [{
          id: 'text-1',
          type: 'text',
          x: 0, y: 0, width: 100, height: 50,
          content: { text: 'A'.repeat(1000) },
        }],
      });
      
      const emptySize = estimateHtmlSize(emptyDoc);
      const textSize = estimateHtmlSize(textDoc);
      
      assert(textSize > emptySize, 'Text doc should be larger');
      assert(textSize - emptySize >= 2000, 'Should increase by at least 2KB for 1000 chars');
    },
  },
  // ==========================================================================
  // performance budget tests (bear blog fast)
  // ==========================================================================
  {
    name: 'PERF: no google fonts references',
    fn: () => {
      const doc = createTestPageDoc();
      const html = renderPageHtml(doc);
      
      assert(!html.includes('fonts.googleapis.com'), 'Should not reference Google Fonts API');
      assert(!html.includes('fonts.gstatic.com'), 'Should not reference Google Fonts static');
    },
  },
  {
    name: 'PERF: no script tags',
    fn: () => {
      const doc = createTestPageDoc();
      const html = renderPageHtml(doc);
      
      assert(!html.includes('<script'), 'Should not contain script tags');
    },
  },
  {
    name: 'PERF: no appOrigin logo references in CTA',
    fn: () => {
      const doc = createTestPageDoc();
      const html = renderPageHtml(doc, { appOrigin: 'https://example.com' });
      
      assert(!html.includes('https://example.com/logo.png'), 'Should not reference logo.png');
      assert(!html.includes('/logo.png'), 'Should not reference any logo.png');
    },
  },
  {
    name: 'PERF: CSP has script-src none',
    fn: () => {
      const doc = createTestPageDoc();
      const html = renderPageHtml(doc);
      
      assert(html.includes("script-src 'none'"), 'CSP should have script-src none');
    },
  },
  {
    name: 'PERF: includes Permissions-Policy',
    fn: () => {
      const doc = createTestPageDoc();
      const html = renderPageHtml(doc);
      
      assert(html.includes('Permissions-Policy'), 'Should include Permissions-Policy header');
      assert(html.includes('camera=()'), 'Should disable camera');
    },
  },
  {
    name: 'PERF: small page stays under 60KB',
    fn: () => {
      const doc = createTestPageDoc({
        blocks: [
          { id: 'text-1', type: 'text', x: 0, y: 0, width: 300, height: 50, content: { text: 'Hello world' } },
          { id: 'link-1', type: 'link', x: 0, y: 60, width: 300, height: 50, content: { label: 'My Link', url: 'https://example.com' } },
        ],
      });
      const html = renderPageHtml(doc);
      const sizeBytes = new TextEncoder().encode(html).length;
      
      assert(sizeBytes < 60000, `HTML should be under 60KB, got ${sizeBytes} bytes`);
    },
  },
  {
    name: 'PERF: images have decoding=async',
    fn: () => {
      const doc = createTestPageDoc({
        blocks: [{
          id: 'img-1',
          type: 'image',
          x: 0, y: 0, width: 200, height: 150,
          content: { url: '/assets/test.png', alt: 'Test' },
        }],
      });
      const html = renderPageHtml(doc);
      
      assert(html.includes('decoding="async"'), 'Images should have decoding=async');
    },
  },
  {
    name: 'blocks remote images when no storage domain configured',
    fn: () => {
      // this test verifies fail-closed behavior
      // when ALLOWED_IMAGE_DOMAINS is empty, absolute URLs should be blocked
      const doc = createTestPageDoc({
        blocks: [{
          id: 'img-1',
          type: 'image',
          x: 0, y: 0, width: 200, height: 150,
          content: { url: 'https://random-site.com/image.png', alt: 'External' },
        }],
      });
      const html = renderPageHtml(doc);
      
      // the image should be blocked and show placeholder
      assert(html.includes('Image unavailable'), 'Should show image unavailable for blocked URLs');
      assert(!html.includes('https://random-site.com/image.png'), 'Should not include blocked image URL');
    },
  },
];

// =============================================================================
// Run tests
// =============================================================================

console.log('Running renderer tests...\n');

let passed = 0;
let failed = 0;

for (const test of tests) {
  try {
    test.fn();
    console.log(`✅ ${test.name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${test.name}`);
    console.log(`   Error: ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
