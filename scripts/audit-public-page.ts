#!/usr/bin/env ts-node
/**
 * audit script for public page headers.
 * 
 * fetches a published page and verifies:
 * - redirect behavior
 * - cache headers (cache-control, content-type)
 * - cloudflare status headers
 * 
 * usage:
 *   npx ts-node scripts/audit-public-page.ts --slug <slug>
 *   npm run audit-page -- --slug <slug>
 */

// =============================================================================
// configuration
// =============================================================================

const APP_ORIGIN = process.env.APP_ORIGIN || process.env.PUBLIC_URL || 'http://localhost:3000';
const S3_PUBLIC_BASE_URL = process.env.S3_PUBLIC_BASE_URL;

// expected headers
const EXPECTED_CONTENT_TYPE = 'text/html';
const EXPECTED_CACHE_CONTROL_PATTERNS = [
  /public/,
  /max-age=\d+/,
];

// =============================================================================
// argument parsing
// =============================================================================

function parseArgs(): { slug: string } {
  const args = process.argv.slice(2);
  const slugIndex = args.indexOf('--slug');
  
  if (slugIndex === -1 || slugIndex === args.length - 1) {
    console.error('usage: audit-public-page.ts --slug <slug>');
    console.error('example: npm run audit-page -- --slug user-abc12345');
    process.exit(1);
  }
  
  return { slug: args[slugIndex + 1] };
}

// =============================================================================
// header audit
// =============================================================================

interface AuditResult {
  url: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  checks: Array<{ name: string; passed: boolean; value?: string; expected?: string }>;
}

async function auditUrl(url: string, name: string): Promise<AuditResult> {
  console.log(`\n📡 fetching ${name}: ${url}`);
  
  const response = await fetch(url, {
    redirect: 'follow',
  });
  
  // collect headers
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  
  const checks: AuditResult['checks'] = [];
  
  // check status
  checks.push({
    name: 'status',
    passed: response.ok,
    value: String(response.status),
    expected: '200',
  });
  
  // check content-type
  const contentType = headers['content-type'] || '';
  checks.push({
    name: 'content-type',
    passed: contentType.includes(EXPECTED_CONTENT_TYPE),
    value: contentType,
    expected: EXPECTED_CONTENT_TYPE,
  });
  
  // check cache-control
  const cacheControl = headers['cache-control'] || '';
  const cacheValid = EXPECTED_CACHE_CONTROL_PATTERNS.every(p => p.test(cacheControl));
  checks.push({
    name: 'cache-control',
    passed: cacheValid,
    value: cacheControl || '(not set)',
    expected: 'public, max-age=...',
  });
  
  return {
    url,
    finalUrl: response.url,
    status: response.status,
    headers,
    checks,
  };
}

function printResult(result: AuditResult): void {
  console.log(`\n   status: ${result.status}`);
  console.log(`   final url: ${result.finalUrl}`);
  
  console.log('\n   headers:');
  const importantHeaders = [
    'content-type',
    'cache-control',
    'cf-cache-status',
    'age',
    'etag',
    'last-modified',
    'x-cache',
  ];
  
  for (const header of importantHeaders) {
    const value = result.headers[header];
    if (value) {
      console.log(`     ${header}: ${value}`);
    }
  }
  
  console.log('\n   checks:');
  for (const check of result.checks) {
    const icon = check.passed ? '✅' : '❌';
    console.log(`     ${icon} ${check.name}: ${check.value} (expected: ${check.expected})`);
  }
}

// =============================================================================
// main
// =============================================================================

async function main() {
  const { slug } = parseArgs();
  
  console.log('🔍 public page header audit');
  console.log(`   app origin: ${APP_ORIGIN}`);
  console.log(`   storage url: ${S3_PUBLIC_BASE_URL || '(not configured)'}`);
  console.log(`   slug: ${slug}`);
  
  const results: AuditResult[] = [];
  
  // audit the public route /u/{slug}
  const publicUrl = `${APP_ORIGIN}/u/${slug}`;
  try {
    const publicResult = await auditUrl(publicUrl, 'public route');
    printResult(publicResult);
    results.push(publicResult);
  } catch (error) {
    console.error(`\n❌ failed to fetch public route: ${error}`);
  }
  
  // audit the storage artifact directly (if configured)
  if (S3_PUBLIC_BASE_URL) {
    const artifactUrl = `${S3_PUBLIC_BASE_URL}/pages/${slug}/index.html`;
    try {
      const artifactResult = await auditUrl(artifactUrl, 'storage artifact');
      printResult(artifactResult);
      results.push(artifactResult);
    } catch (error) {
      console.error(`\n❌ failed to fetch storage artifact: ${error}`);
    }
  } else {
    console.log('\n⚠️  S3_PUBLIC_BASE_URL not configured - skipping artifact check');
  }
  
  // summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 summary');
  console.log('='.repeat(60));
  
  let allPassed = true;
  for (const result of results) {
    const failedChecks = result.checks.filter(c => !c.passed);
    if (failedChecks.length > 0) {
      allPassed = false;
      console.log(`\n❌ ${result.url}`);
      for (const check of failedChecks) {
        console.log(`   - ${check.name}: got "${check.value}", expected "${check.expected}"`);
      }
    } else {
      console.log(`\n✅ ${result.url} - all checks passed`);
    }
  }
  
  // redirect check
  if (results.length >= 1) {
    const publicResult = results[0];
    if (publicResult.finalUrl !== publicResult.url) {
      console.log(`\n📎 redirect: ${publicResult.url} → ${publicResult.finalUrl}`);
    }
  }
  
  if (allPassed) {
    console.log('\n✨ all audits passed!\n');
  } else {
    console.log('\n⚠️  some checks failed - review above\n');
    process.exit(1);
  }
}

// =============================================================================
// run
// =============================================================================

main().catch((err) => {
  console.error('❌ audit failed with error:', err);
  process.exit(1);
});

