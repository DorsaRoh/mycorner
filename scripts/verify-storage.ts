#!/usr/bin/env ts-node
/**
 * Storage Configuration Verification Script
 * 
 * Verifies that storage is properly configured by:
 * 1. Calling /api/health/storage endpoint
 * 2. Optionally testing a sample publish (if --test-publish flag is passed)
 * 
 * Usage:
 *   npx ts-node --project tsconfig.server.json scripts/verify-storage.ts
 *   npx ts-node --project tsconfig.server.json scripts/verify-storage.ts --test-publish
 * 
 * Environment:
 *   BASE_URL          - Base URL of the app (default: http://localhost:3000)
 *   HEALTHCHECK_TOKEN - Required for production health check access
 */

// =============================================================================
// Config
// =============================================================================

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const HEALTHCHECK_TOKEN = process.env.HEALTHCHECK_TOKEN;
const TEST_PUBLISH = process.argv.includes('--test-publish');

// required storage env vars (for local verification)
const REQUIRED_ENV_VARS = [
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_PUBLIC_BASE_URL',
] as const;

// =============================================================================
// Helpers
// =============================================================================

function log(message: string): void {
  console.log(`[verify-storage] ${message}`);
}

function error(message: string): void {
  console.error(`[verify-storage] ❌ ${message}`);
}

function success(message: string): void {
  console.log(`[verify-storage] ✅ ${message}`);
}

function warn(message: string): void {
  console.warn(`[verify-storage] ⚠️  ${message}`);
}

// =============================================================================
// Local Environment Check
// =============================================================================

function checkLocalEnvVars(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }
  
  return { ok: missing.length === 0, missing };
}

// =============================================================================
// Health Check
// =============================================================================

interface HealthResponse {
  ok: boolean;
  storageConfigured: boolean;
  publicBaseUrlConfigured: boolean;
  uploadConfigured: boolean;
  cdnPurgeConfigured: boolean;
  missingEnvVars?: string[];
  publicBaseUrlValid?: boolean;
  publicBaseUrlError?: string;
  requiredEnvVars: string[];
}

async function checkHealthEndpoint(): Promise<{ ok: boolean; response?: HealthResponse; error?: string }> {
  const url = `${BASE_URL}/api/health/storage`;
  
  log(`Checking health endpoint: ${url}`);
  
  const headers: Record<string, string> = {};
  if (HEALTHCHECK_TOKEN) {
    headers['Authorization'] = `Bearer ${HEALTHCHECK_TOKEN}`;
  }
  
  try {
    const response = await fetch(url, { headers });
    
    if (response.status === 404) {
      return { ok: false, error: 'Health endpoint returned 404 (possibly auth required or endpoint not found)' };
    }
    
    const data = await response.json() as HealthResponse;
    
    return { ok: data.ok, response: data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: `Failed to reach health endpoint: ${message}` };
  }
}

// =============================================================================
// Publish Test
// =============================================================================

interface PublishResponse {
  success: boolean;
  slug?: string;
  error?: string;
  code?: string;
  missingEnvVars?: string[];
}

async function testPublish(): Promise<{ ok: boolean; response?: PublishResponse; error?: string }> {
  const url = `${BASE_URL}/api/publish`;
  
  log(`Testing publish endpoint: ${url}`);
  
  // minimal sample PageDoc
  const sampleDoc = {
    version: 1,
    title: 'Storage Verification Test',
    themeId: 'default',
    blocks: [
      {
        id: 'test-block-1',
        type: 'text',
        x: 100,
        y: 100,
        width: 200,
        height: 50,
        content: 'This is a test page for storage verification.',
        fontSize: 16,
      },
    ],
  };
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc: sampleDoc }),
    });
    
    const data = await response.json() as PublishResponse;
    
    if (response.status === 401) {
      return { ok: false, error: 'Authentication required for publish test (login first)' };
    }
    
    if (response.status === 503 && data.code === 'STORAGE_NOT_CONFIGURED') {
      return { 
        ok: false, 
        response: data,
        error: `Storage not configured. Missing: ${data.missingEnvVars?.join(', ')}` 
      };
    }
    
    return { ok: data.success, response: data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: `Failed to reach publish endpoint: ${message}` };
  }
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  log('Starting storage verification...\n');
  
  let hasErrors = false;
  
  // step 1: check local environment variables
  log('Step 1: Checking local environment variables');
  const localCheck = checkLocalEnvVars();
  
  if (localCheck.ok) {
    success('All required environment variables are set locally');
  } else {
    warn(`Missing local env vars: ${localCheck.missing.join(', ')}`);
    log('  (This is expected if running against a remote server)\n');
  }
  
  // step 2: check health endpoint
  log('\nStep 2: Checking /api/health/storage endpoint');
  const healthCheck = await checkHealthEndpoint();
  
  if (healthCheck.ok) {
    success('Storage health check passed');
    if (healthCheck.response) {
      log(`  - Upload configured: ${healthCheck.response.uploadConfigured}`);
      log(`  - Public base URL configured: ${healthCheck.response.publicBaseUrlConfigured}`);
      log(`  - CDN purge configured: ${healthCheck.response.cdnPurgeConfigured}`);
    }
  } else if (healthCheck.error) {
    error(healthCheck.error);
    hasErrors = true;
    
    if (healthCheck.response?.missingEnvVars) {
      log(`  Missing env vars: ${healthCheck.response.missingEnvVars.join(', ')}`);
    }
  } else if (healthCheck.response) {
    error('Storage not fully configured');
    hasErrors = true;
    
    if (healthCheck.response.missingEnvVars) {
      log(`  Missing: ${healthCheck.response.missingEnvVars.join(', ')}`);
    }
    if (healthCheck.response.publicBaseUrlError) {
      log(`  URL error: ${healthCheck.response.publicBaseUrlError}`);
    }
  }
  
  // step 3: test publish (optional)
  if (TEST_PUBLISH) {
    log('\nStep 3: Testing publish endpoint');
    const publishCheck = await testPublish();
    
    if (publishCheck.ok) {
      success(`Publish test passed! Slug: ${publishCheck.response?.slug}`);
    } else {
      error(publishCheck.error || 'Publish test failed');
      hasErrors = true;
    }
  } else {
    log('\nStep 3: Skipping publish test (use --test-publish to enable)');
  }
  
  // summary
  log('\n' + '='.repeat(60));
  if (hasErrors) {
    error('Storage verification FAILED');
    log('\nRequired environment variables:');
    for (const varName of REQUIRED_ENV_VARS) {
      log(`  - ${varName}`);
    }
    log('\nSee docs/SHIP_CHECKLIST.md for deployment setup.');
    process.exit(1);
  } else {
    success('Storage verification PASSED');
    process.exit(0);
  }
}

// run
main().catch((err) => {
  error(`Unexpected error: ${err.message}`);
  process.exit(1);
});

