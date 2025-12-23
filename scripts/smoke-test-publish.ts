#!/usr/bin/env ts-node
/**
 * Smoke test for the publish flow.
 * 
 * This script verifies the full publish pipeline works:
 * 1. Publishes a test document to storage
 * 2. Fetches the published page from /u/{slug}
 * 3. Verifies the HTML contains expected marker text
 * 
 * Usage:
 *   npx ts-node scripts/smoke-test-publish.ts
 * 
 * Requirements:
 *   - Server running at APP_ORIGIN or localhost:3000
 *   - Valid session cookie for authentication (or use --skip-auth for dev)
 *   - S3_PUBLIC_BASE_URL configured
 */

import { createEmptyPageDoc } from '../src/lib/schema/page';

// =============================================================================
// Configuration
// =============================================================================

const APP_ORIGIN = process.env.APP_ORIGIN || process.env.PUBLIC_URL || 'http://localhost:3000';
const MARKER_TEXT = 'SMOKE_TEST_MARKER_' + Date.now();

// =============================================================================
// Test Document
// =============================================================================

function createTestDoc() {
  const doc = createEmptyPageDoc();
  doc.title = `Smoke Test ${Date.now()}`;
  doc.blocks = [
    {
      id: 'smoke-test-block',
      type: 'text' as const,
      x: 50,
      y: 50,
      width: 200,
      height: 100,
      content: { text: MARKER_TEXT },
    },
  ];
  return doc;
}

// =============================================================================
// Main Test
// =============================================================================

async function main() {
  console.log('🔥 Smoke Test: Publish Flow\n');
  console.log(`   App Origin: ${APP_ORIGIN}`);
  console.log(`   Marker Text: ${MARKER_TEXT}\n`);
  
  const skipAuth = process.argv.includes('--skip-auth');
  const sessionCookie = process.env.SESSION_COOKIE;
  
  if (!skipAuth && !sessionCookie) {
    console.error('❌ SESSION_COOKIE environment variable required for authenticated publish.');
    console.error('   Set SESSION_COOKIE to your connect.sid cookie value, or use --skip-auth for dev testing.');
    console.error('   Example: SESSION_COOKIE="s%3A..." npx ts-node scripts/smoke-test-publish.ts');
    process.exit(1);
  }
  
  // Step 1: Publish the test document
  console.log('1️⃣  Publishing test document...');
  
  const doc = createTestDoc();
  const publishUrl = `${APP_ORIGIN}/api/publish`;
  
  const publishRes = await fetch(publishUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionCookie ? { 'Cookie': `connect.sid=${sessionCookie}` } : {}),
    },
    body: JSON.stringify({ doc }),
  });
  
  if (!publishRes.ok) {
    const text = await publishRes.text();
    console.error(`❌ Publish failed: ${publishRes.status}`);
    console.error(`   Response: ${text}`);
    process.exit(1);
  }
  
  const publishData = await publishRes.json() as { success: boolean; slug?: string; error?: string };
  
  if (!publishData.success || !publishData.slug) {
    console.error(`❌ Publish returned failure: ${publishData.error}`);
    process.exit(1);
  }
  
  const slug = publishData.slug;
  console.log(`   ✅ Published to slug: ${slug}`);
  
  // Step 2: Fetch the published page
  console.log('\n2️⃣  Fetching published page...');
  
  const pageUrl = `${APP_ORIGIN}/u/${slug}`;
  console.log(`   URL: ${pageUrl}`);
  
  // Allow redirects to follow to the actual storage URL
  const pageRes = await fetch(pageUrl, {
    redirect: 'follow',
  });
  
  if (!pageRes.ok) {
    console.error(`❌ Page fetch failed: ${pageRes.status}`);
    console.error(`   Final URL: ${pageRes.url}`);
    process.exit(1);
  }
  
  const html = await pageRes.text();
  console.log(`   ✅ Fetched ${html.length} bytes from ${pageRes.url}`);
  
  // Step 3: Verify marker text
  console.log('\n3️⃣  Verifying content...');
  
  if (!html.includes(MARKER_TEXT)) {
    console.error(`❌ Marker text not found in HTML!`);
    console.error(`   Expected: ${MARKER_TEXT}`);
    console.error(`   HTML preview: ${html.slice(0, 500)}...`);
    process.exit(1);
  }
  
  console.log(`   ✅ Marker text found in HTML`);
  
  // Step 4: Verify cache headers (if we can access them)
  const cacheControl = pageRes.headers.get('cache-control');
  if (cacheControl) {
    console.log(`\n4️⃣  Cache headers: ${cacheControl}`);
    if (cacheControl.includes('max-age=')) {
      console.log(`   ✅ Cache-Control is set`);
    }
  }
  
  // Success!
  console.log('\n✨ Smoke test passed!\n');
  console.log(`   Published page: ${pageUrl}`);
  console.log(`   Storage URL: ${pageRes.url}`);
}

// =============================================================================
// Run
// =============================================================================

main().catch((err) => {
  console.error('❌ Smoke test failed with error:', err);
  process.exit(1);
});

