#!/usr/bin/env ts-node
/**
 * smoke test for the publish flow.
 * 
 * this script verifies the full publish pipeline works:
 * 1. publishes a test document to storage
 * 2. fetches the published page from /{username} (follows redirect to R2)
 * 3. verifies the HTML contains expected marker text
 * 4. reports headers like cache-control and final url
 * 
 * usage:
 *   APP_ORIGIN=http://localhost:3000 SESSION_COOKIE="yourcorner_session=..." npx tsx scripts/smoke-test-publish.ts
 * 
 * requirements:
 *   - server running at APP_ORIGIN or localhost:3000
 *   - valid session cookie for authentication (yourcorner_session)
 *   - S3_PUBLIC_BASE_URL configured (for production-like testing)
 */

import { createEmptyPageDoc } from '../src/lib/schema/page';

// =============================================================================
// configuration
// =============================================================================

const APP_ORIGIN = process.env.APP_ORIGIN || process.env.PUBLIC_URL || 'http://localhost:3000';
const SESSION_COOKIE = process.env.SESSION_COOKIE;
const MARKER_TEXT = 'SMOKE_TEST_MARKER_' + Date.now();

// =============================================================================
// test document
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
// main test
// =============================================================================

interface PublishResponse {
  success: boolean;
  slug?: string;
  publicUrl?: string;
  storageKey?: string;
  error?: string;
  code?: string;
}

async function main() {
  console.log('🔥 Smoke Test: Publish Flow\n');
  console.log(`   App Origin: ${APP_ORIGIN}`);
  console.log(`   Marker Text: ${MARKER_TEXT}`);
  console.log(`   Session Cookie: ${SESSION_COOKIE ? 'provided' : 'not provided'}\n`);
  
  if (!SESSION_COOKIE) {
    console.error('❌ SESSION_COOKIE environment variable required for authenticated publish.');
    console.error('   Set SESSION_COOKIE to your yourcorner_session cookie value.');
    console.error('   Example: SESSION_COOKIE="yourcorner_session=eyJ..." npx tsx scripts/smoke-test-publish.ts');
    process.exit(1);
  }
  
  // step 1: publish the test document
  console.log('1️⃣  Publishing test document...');
  
  const doc = createTestDoc();
  const publishUrl = `${APP_ORIGIN}/api/publish`;
  
  const publishRes = await fetch(publishUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': SESSION_COOKIE,
    },
    body: JSON.stringify({ doc }),
  });
  
  if (!publishRes.ok) {
    const text = await publishRes.text();
    console.error(`❌ Publish failed: ${publishRes.status}`);
    console.error(`   Response: ${text}`);
    
    // try to parse and provide helpful info
    try {
      const parsed = JSON.parse(text);
      if (parsed.code === 'USERNAME_REQUIRED') {
        console.error('\n   💡 Hint: User needs a username. Complete onboarding first.');
      } else if (parsed.code === 'STORAGE_NOT_CONFIGURED') {
        console.error('\n   💡 Hint: Storage not configured. Set S3_* environment variables.');
      }
    } catch {
      // ignore parse error
    }
    
    process.exit(1);
  }
  
  const publishData = await publishRes.json() as PublishResponse;
  
  if (!publishData.success || !publishData.slug) {
    console.error(`❌ Publish returned failure: ${publishData.error}`);
    process.exit(1);
  }
  
  const slug = publishData.slug;
  const publicUrl = publishData.publicUrl;
  const storageKey = publishData.storageKey;
  
  console.log(`   ✅ Published to slug: ${slug}`);
  console.log(`   📍 Public URL: ${publicUrl}`);
  console.log(`   🗄️  Storage Key: ${storageKey}`);
  
  // step 2: fetch the published page using the public url
  console.log('\n2️⃣  Fetching published page...');
  
  // use publicUrl path or construct from slug
  let pageUrl: string;
  if (publicUrl) {
    try {
      const url = new URL(publicUrl);
      // use app origin with the path from publicUrl (in case publicUrl uses different host)
      pageUrl = `${APP_ORIGIN}${url.pathname}`;
    } catch {
      // publicUrl is already a path
      pageUrl = `${APP_ORIGIN}${publicUrl.startsWith('/') ? publicUrl : '/' + publicUrl}`;
    }
  } else {
    pageUrl = `${APP_ORIGIN}/${slug}`;
  }
  
  console.log(`   URL: ${pageUrl}`);
  
  // allow redirects to follow to the actual storage URL
  const pageRes = await fetch(pageUrl, {
    redirect: 'follow',
  });
  
  if (!pageRes.ok) {
    console.error(`❌ Page fetch failed: ${pageRes.status}`);
    console.error(`   Final URL: ${pageRes.url}`);
    process.exit(1);
  }
  
  const html = await pageRes.text();
  console.log(`   ✅ Fetched ${html.length} bytes`);
  console.log(`   📍 Final URL: ${pageRes.url}`);
  
  // step 3: verify marker text
  console.log('\n3️⃣  Verifying content...');
  
  if (!html.includes(MARKER_TEXT)) {
    console.error(`❌ Marker text not found in HTML!`);
    console.error(`   Expected: ${MARKER_TEXT}`);
    console.error(`   HTML preview: ${html.slice(0, 500)}...`);
    process.exit(1);
  }
  
  console.log(`   ✅ Marker text found in HTML`);
  
  // step 4: report headers
  console.log('\n4️⃣  Response headers:');
  const cacheControl = pageRes.headers.get('cache-control');
  const contentType = pageRes.headers.get('content-type');
  
  if (cacheControl) {
    console.log(`   Cache-Control: ${cacheControl}`);
  } else {
    console.log(`   Cache-Control: (not set)`);
  }
  
  if (contentType) {
    console.log(`   Content-Type: ${contentType}`);
  }
  
  // success!
  console.log('\n✨ Smoke test passed!\n');
  console.log(`   Published slug: ${slug}`);
  console.log(`   Public URL: ${publicUrl || `${APP_ORIGIN}/${slug}`}`);
  console.log(`   Storage URL: ${pageRes.url}`);
}

// =============================================================================
// run
// =============================================================================

main().catch((err) => {
  console.error('❌ Smoke test failed with error:', err);
  process.exit(1);
});

