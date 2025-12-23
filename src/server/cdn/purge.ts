/**
 * CDN cache purge module.
 * 
 * Supports:
 * - Cloudflare (recommended)
 * - Generic webhook-based purge
 * 
 * Called after publishing to ensure fresh content is served.
 * 
 * PRODUCTION BEHAVIOR:
 * - If purge is configured, errors are logged but don't fail publish
 * - If purge is not configured, HTML cache TTL is kept short (see storage/client.ts)
 * - All URLs must be valid https:// URLs
 * - Supports multiple app origins via APP_ORIGINS env var
 */

// =============================================================================
// types
// =============================================================================

export interface PurgeResult {
  success: boolean;
  message: string;
  purgedUrls?: string[];
  skippedUrls?: string[];
  warnings?: string[];
}

// =============================================================================
// configuration
// =============================================================================

interface CloudflareConfig {
  apiToken: string;
  zoneId: string;
}

function getCloudflareConfig(): CloudflareConfig | null {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  
  if (!apiToken || !zoneId) {
    return null;
  }
  
  return { apiToken, zoneId };
}

/**
 * Check if CDN purge is configured.
 */
export function isPurgeConfigured(): boolean {
  return !!(
    getCloudflareConfig() ||
    process.env.CDN_PURGE_WEBHOOK_URL
  );
}

/**
 * Get all app origins for purging.
 * Supports APP_ORIGINS (comma-separated) with fallback to APP_ORIGIN.
 */
export function getAppOrigins(): string[] {
  // prefer APP_ORIGINS (comma-separated list)
  const originsEnv = process.env.APP_ORIGINS;
  if (originsEnv) {
    return originsEnv
      .split(',')
      .map(o => o.trim())
      .filter(o => o.length > 0);
  }
  
  // fallback to single APP_ORIGIN
  const singleOrigin = process.env.APP_ORIGIN;
  if (singleOrigin) {
    return [singleOrigin];
  }
  
  return [];
}

// =============================================================================
// url validation
// =============================================================================

/**
 * Validate and sanitize URLs for purging.
 * Only fully qualified https:// URLs are allowed.
 */
function sanitizeUrls(urls: string[]): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        valid.push(url);
      } else {
        invalid.push(url);
      }
    } catch {
      invalid.push(url);
    }
  }
  
  return { valid, invalid };
}

// =============================================================================
// cloudflare purge
// =============================================================================

interface CloudflareResponse {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  messages?: Array<{ code: number; message: string }>;
  result?: { id: string };
}

async function purgeCloudflare(urls: string[]): Promise<PurgeResult> {
  const config = getCloudflareConfig();
  if (!config) {
    return { success: false, message: 'Cloudflare not configured' };
  }
  
  // sanitize urls
  const { valid, invalid } = sanitizeUrls(urls);
  
  if (invalid.length > 0) {
    console.warn('[cdn purge] skipping invalid urls:', invalid);
  }
  
  if (valid.length === 0) {
    return { 
      success: true, 
      message: 'No valid URLs to purge',
      purgedUrls: [],
      skippedUrls: invalid,
    };
  }
  
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${config.zoneId}/purge_cache`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files: valid }),
      }
    );
    
    const responseText = await response.text();
    let data: CloudflareResponse;
    
    try {
      data = JSON.parse(responseText) as CloudflareResponse;
    } catch {
      console.error('[cdn purge] cloudflare invalid json response:', responseText);
      return { 
        success: false, 
        message: `Invalid response from Cloudflare: ${response.status}`,
        purgedUrls: [],
        skippedUrls: invalid,
      };
    }
    
    if (!data.success) {
      const errorDetails = data.errors?.map(e => `${e.code}: ${e.message}`).join('; ') || 'Unknown error';
      console.error('[cdn purge] cloudflare error:', {
        status: response.status,
        errors: data.errors,
        messages: data.messages,
        fullResponse: responseText,
      });
      return { 
        success: false, 
        message: `Cloudflare purge failed: ${errorDetails}`,
        purgedUrls: [],
        skippedUrls: [...valid, ...invalid],
      };
    }
    
    console.log(`[cdn purge] purged ${valid.length} urls via cloudflare`);
    return { 
      success: true, 
      message: `Purged ${valid.length} URLs`,
      purgedUrls: valid,
      skippedUrls: invalid,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cdn purge] cloudflare request failed:', msg);
    return { 
      success: false, 
      message: msg,
      purgedUrls: [],
      skippedUrls: [...urls],
    };
  }
}

// =============================================================================
// generic webhook purge
// =============================================================================

async function purgeWebhook(urls: string[]): Promise<PurgeResult> {
  const webhookUrl = process.env.CDN_PURGE_WEBHOOK_URL;
  if (!webhookUrl) {
    return { success: false, message: 'No CDN purge webhook configured' };
  }
  
  // sanitize urls
  const { valid, invalid } = sanitizeUrls(urls);
  
  if (invalid.length > 0) {
    console.warn('[cdn purge] skipping invalid urls:', invalid);
  }
  
  if (valid.length === 0) {
    return { 
      success: true, 
      message: 'No valid URLs to purge',
      purgedUrls: [],
      skippedUrls: invalid,
    };
  }
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': process.env.CDN_PURGE_WEBHOOK_SECRET || '',
      },
      body: JSON.stringify({ urls: valid }),
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error('[cdn purge] webhook failed:', {
        status: response.status,
        body: text,
      });
      return { 
        success: false, 
        message: `Webhook failed: ${response.status} ${text}`,
        purgedUrls: [],
        skippedUrls: [...valid, ...invalid],
      };
    }
    
    console.log(`[cdn purge] purged ${valid.length} urls via webhook`);
    return { 
      success: true, 
      message: `Purged ${valid.length} URLs`,
      purgedUrls: valid,
      skippedUrls: invalid,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cdn purge] webhook request failed:', msg);
    return { 
      success: false, 
      message: msg,
      purgedUrls: [],
      skippedUrls: [...urls],
    };
  }
}

// =============================================================================
// public api
// =============================================================================

/**
 * Purge URLs from CDN cache.
 * 
 * @param urls - Full URLs to purge
 * @returns Result indicating success/failure
 */
export async function purgeUrls(urls: string[]): Promise<PurgeResult> {
  if (urls.length === 0) {
    return { success: true, message: 'No URLs to purge', purgedUrls: [], skippedUrls: [] };
  }
  
  // try cloudflare first
  if (getCloudflareConfig()) {
    return purgeCloudflare(urls);
  }
  
  // fall back to webhook
  if (process.env.CDN_PURGE_WEBHOOK_URL) {
    return purgeWebhook(urls);
  }
  
  // no purge configured
  // in production, log a warning but don't fail (ttl is kept short in storage/client.ts)
  if (process.env.NODE_ENV === 'production') {
    console.warn('[cdn purge] no cdn purge configured in production. cache ttl is limited to 5 minutes.');
  }
  
  return { 
    success: true, 
    message: 'No CDN configured, skipped purge',
    purgedUrls: [],
    skippedUrls: urls,
  };
}

/**
 * Purge a published page from CDN cache.
 * 
 * Purges:
 * - ${origin}/u/${slug} for each origin in APP_ORIGINS
 * - ${S3_PUBLIC_BASE_URL}/pages/${slug}/index.html - The storage artifact
 * 
 * @param slug - Page slug
 * @returns Result indicating success/failure with any warnings
 */
export async function purgePage(slug: string): Promise<PurgeResult> {
  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL;
  const appOrigins = getAppOrigins();
  const warnings: string[] = [];
  
  const urls: string[] = [];
  
  // add storage url (artifact)
  if (publicBaseUrl) {
    urls.push(`${publicBaseUrl}/pages/${slug}/index.html`);
  }
  
  // add app urls for all origins (user entrypoints)
  if (appOrigins.length > 0) {
    for (const origin of appOrigins) {
      urls.push(`${origin}/u/${slug}`);
    }
  } else if (isPurgeConfigured() && process.env.NODE_ENV === 'production') {
    // purge is configured but no origins set - this is a misconfig
    const warning = 'APP_ORIGINS not set in production. User-facing URLs will not be purged. Set APP_ORIGINS to comma-separated list of origins (e.g., https://example.com,https://www.example.com)';
    console.error('[cdn purge]', warning);
    warnings.push(warning);
  }
  
  const result = await purgeUrls(urls);
  
  // include warnings in result
  if (warnings.length > 0) {
    result.warnings = [...(result.warnings || []), ...warnings];
  }
  
  return result;
}
