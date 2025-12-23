/**
 * S3-compatible storage client for static page hosting.
 * 
 * Works with:
 * - Cloudflare R2
 * - AWS S3
 * - Backblaze B2
 * - MinIO
 * - Any S3-compatible provider
 * 
 * Storage keys:
 * - pages/{slug}/index.html - Published static pages
 * - assets/{userId}/{uuid}.{ext} - User-uploaded images
 */

import { isPurgeConfigured } from '../cdn/purge';

// =============================================================================
// Types
// =============================================================================

export interface StorageConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  region?: string;
}

export interface UploadOptions {
  contentType: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  key: string;
  publicUrl: string;
  etag?: string;
}

// =============================================================================
// Slug Validation
// =============================================================================

/** Valid slug pattern: lowercase alphanumeric with hyphens, 1-64 chars */
const SLUG_PATTERN = /^[a-z0-9-]{1,64}$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/**
 * Generate base slug from userId.
 * Format: user-{first 8 chars of userId lowercase}
 * NEVER uses username or any profile field.
 */
export function generateBaseSlug(userId: string): string {
  return `user-${userId.slice(0, 8).toLowerCase()}`;
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Get the public base URL for serving pages.
 * This requires NO secrets - only the public URL.
 */
export function getPublicBaseUrl(): string | null {
  return process.env.S3_PUBLIC_BASE_URL || process.env.PUBLIC_PAGES_BASE_URL || null;
}

/**
 * Check if public page serving is configured (no secrets required).
 * Used by /[slug] to fetch and serve static HTML from storage.
 */
export function isPublicPagesConfigured(): boolean {
  return !!getPublicBaseUrl();
}

/**
 * Required environment variables for full storage functionality.
 */
export const REQUIRED_STORAGE_ENV_VARS = [
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_PUBLIC_BASE_URL',
] as const;

/**
 * Check if upload credentials are configured.
 * This requires secrets and is used by publish/upload endpoints.
 */
export function isUploadConfigured(): boolean {
  return !!(
    process.env.S3_ENDPOINT &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY &&
    process.env.S3_BUCKET &&
    getPublicBaseUrl()
  );
}

/**
 * Get missing storage environment variables.
 * Returns an array of missing variable names.
 */
export function getMissingStorageEnvVars(): string[] {
  const missing: string[] = [];
  
  if (!process.env.S3_ENDPOINT) missing.push('S3_ENDPOINT');
  if (!process.env.S3_BUCKET) missing.push('S3_BUCKET');
  if (!process.env.S3_ACCESS_KEY_ID) missing.push('S3_ACCESS_KEY_ID');
  if (!process.env.S3_SECRET_ACCESS_KEY) missing.push('S3_SECRET_ACCESS_KEY');
  if (!getPublicBaseUrl()) missing.push('S3_PUBLIC_BASE_URL');
  
  return missing;
}

/**
 * Validate that S3_PUBLIC_BASE_URL is a valid URL.
 * Returns error message if invalid, null if valid.
 */
export function validatePublicBaseUrl(): string | null {
  const url = getPublicBaseUrl();
  if (!url) return null; // not configured is handled elsewhere
  
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return `S3_PUBLIC_BASE_URL must use http or https protocol, got: ${parsed.protocol}`;
    }
    return null;
  } catch {
    return `S3_PUBLIC_BASE_URL is not a valid URL: ${url}`;
  }
}

/**
 * Get storage configuration or throw with a clear error listing missing keys.
 * Use this when storage is required (e.g., production publish).
 */
export function getStorageConfigOrThrow(): StorageConfig {
  const missing = getMissingStorageEnvVars();
  
  if (missing.length > 0) {
    throw new Error(
      `Storage not configured. Missing environment variables:\n` +
      missing.map(v => `  - ${v}`).join('\n') +
      `\n\nSee docs/SHIP_CHECKLIST.md for deployment setup.`
    );
  }
  
  // validate URL format
  const urlError = validatePublicBaseUrl();
  if (urlError) {
    throw new Error(urlError);
  }
  
  // at this point all vars are present
  return {
    endpoint: process.env.S3_ENDPOINT!,
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    bucket: process.env.S3_BUCKET!,
    publicBaseUrl: getPublicBaseUrl()!,
    region: process.env.S3_REGION || 'auto',
  };
}

/**
 * Require public pages to be configured in production.
 * Returns error message if not configured, null if OK.
 */
export function requirePublicPagesConfigured(): string | null {
  if (process.env.NODE_ENV === 'production' && !isPublicPagesConfigured()) {
    return 'Storage not configured: S3_PUBLIC_BASE_URL is required in production';
  }
  return null;
}

/**
 * Get full storage config (requires secrets).
 * Returns null if not fully configured.
 */
function getStorageConfig(): StorageConfig | null {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET;
  const publicBaseUrl = getPublicBaseUrl();
  
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }
  
  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl,
    region: process.env.S3_REGION || 'auto',
  };
}

// Legacy alias for backward compatibility
export function isStorageConfigured(): boolean {
  return isUploadConfigured();
}

// =============================================================================
// S3 Request Signing (AWS Signature v4)
// =============================================================================

async function sha256(message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  return crypto.subtle.digest('SHA-256', data);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  // Convert to ArrayBuffer, handling both Uint8Array and ArrayBuffer
  let keyBuffer: ArrayBuffer;
  if (key instanceof Uint8Array) {
    keyBuffer = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer;
  } else {
    keyBuffer = key as ArrayBuffer;
  }
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
}

async function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const kDate = await hmac(encoder.encode('AWS4' + secretKey), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

async function signS3Request(
  config: StorageConfig,
  method: string,
  key: string,
  body: string | Buffer,
  contentType: string,
  additionalHeaders?: Record<string, string>
): Promise<SignedRequest> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = config.region || 'auto';
  const service = 's3';
  
  // Parse endpoint URL - use only the origin (protocol + host), strip any path
  const endpointUrl = new URL(config.endpoint);
  const host = endpointUrl.host;
  const endpointOrigin = endpointUrl.origin; // e.g., "https://xxx.r2.cloudflarestorage.com"
  
  // Build canonical URI - path-style: /{bucket}/{key}
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  const canonicalUri = `/${config.bucket}/${encodedKey}`;
  
  // Hash payload
  const bodyString = typeof body === 'string' ? body : body.toString('utf-8');
  const payloadHash = toHex(await sha256(bodyString));
  
  // Build headers
  const headers: Record<string, string> = {
    'host': host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    'content-type': contentType,
    ...additionalHeaders,
  };
  
  // Sort headers for canonical request
  const sortedHeaders = Object.keys(headers).sort();
  const signedHeaders = sortedHeaders.join(';');
  const canonicalHeaders = sortedHeaders
    .map(k => `${k.toLowerCase()}:${headers[k].trim()}`)
    .join('\n');
  
  // Build canonical request
  const canonicalRequest = [
    method,
    canonicalUri,
    '', // query string
    canonicalHeaders + '\n',
    signedHeaders,
    payloadHash,
  ].join('\n');
  
  // Build string to sign
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    toHex(await sha256(canonicalRequest)),
  ].join('\n');
  
  // Calculate signature
  const signingKey = await getSignatureKey(config.secretAccessKey, dateStamp, region, service);
  const signature = toHex(await hmac(signingKey, stringToSign));
  
  // Build authorization header
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  // Build URL using origin only (not full endpoint which may include a path)
  return {
    url: `${endpointOrigin}/${config.bucket}/${encodedKey}`,
    headers: {
      ...headers,
      'Authorization': authorization,
    },
  };
}

// =============================================================================
// Storage Client
// =============================================================================

class StorageClient {
  private config: StorageConfig;
  
  constructor(config: StorageConfig) {
    this.config = config;
  }
  
  /**
   * Upload a file to storage.
   */
  async upload(
    key: string,
    body: string | Buffer,
    options: UploadOptions
  ): Promise<UploadResult> {
    const cacheControl = options.cacheControl || 'public, max-age=3600';
    
    const additionalHeaders: Record<string, string> = {
      'cache-control': cacheControl,
    };
    
    if (options.metadata) {
      for (const [k, v] of Object.entries(options.metadata)) {
        additionalHeaders[`x-amz-meta-${k}`] = v;
      }
    }
    
    const signed = await signS3Request(
      this.config,
      'PUT',
      key,
      body,
      options.contentType,
      additionalHeaders
    );
    
    // Convert Buffer to Uint8Array for fetch compatibility
    const bodyData = Buffer.isBuffer(body) ? new Uint8Array(body) : body;
    
    const response = await fetch(signed.url, {
      method: 'PUT',
      headers: signed.headers,
      body: bodyData,
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Storage upload failed: ${response.status} ${text}`);
    }
    
    const etag = response.headers.get('etag') || undefined;
    
    return {
      key,
      publicUrl: `${this.config.publicBaseUrl}/${key}`,
      etag,
    };
  }
  
  /**
   * Delete a file from storage.
   */
  async delete(key: string): Promise<void> {
    const signed = await signS3Request(
      this.config,
      'DELETE',
      key,
      '',
      'application/octet-stream'
    );
    
    const response = await fetch(signed.url, {
      method: 'DELETE',
      headers: signed.headers,
    });
    
    // 204 or 404 are both acceptable for delete
    if (!response.ok && response.status !== 404) {
      const text = await response.text();
      throw new Error(`Storage delete failed: ${response.status} ${text}`);
    }
  }
  
  /**
   * Check if a file exists.
   */
  async exists(key: string): Promise<boolean> {
    const signed = await signS3Request(
      this.config,
      'HEAD',
      key,
      '',
      'application/octet-stream'
    );
    
    const response = await fetch(signed.url, {
      method: 'HEAD',
      headers: signed.headers,
    });
    
    return response.ok;
  }
  
  /**
   * Get file contents from storage.
   * Returns null if the file does not exist.
   */
  async get(key: string): Promise<string | null> {
    const signed = await signS3Request(
      this.config,
      'GET',
      key,
      '',
      'application/octet-stream'
    );
    
    const response = await fetch(signed.url, {
      method: 'GET',
      headers: signed.headers,
    });
    
    if (response.status === 404) {
      return null;
    }
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Storage get failed: ${response.status} ${text}`);
    }
    
    return response.text();
  }
  
  /**
   * Get the public URL for a key.
   */
  getPublicUrl(key: string): string {
    return `${this.config.publicBaseUrl}/${key}`;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let _client: StorageClient | null = null;

/**
 * Get the storage client instance.
 * Returns null if storage is not configured.
 */
export function getStorageClient(): StorageClient | null {
  if (_client) return _client;
  
  const config = getStorageConfig();
  if (!config) return null;
  
  _client = new StorageClient(config);
  return _client;
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Get the cache control header for HTML pages.
 * Uses shorter TTL if purge is not configured to avoid long stale periods.
 */
function getHtmlCacheControl(): string {
  if (isPurgeConfigured()) {
    // Purge is configured - can use longer TTL since we'll purge on update
    return 'public, max-age=3600'; // 1 hour
  }
  // No purge - use shorter TTL to limit staleness
  return 'public, max-age=300'; // 5 minutes
}

/**
 * Upload a published page HTML.
 * Returns { key, url } on success.
 * Throws if storage not configured or upload fails.
 */
export async function uploadPageHtml(
  slug: string,
  html: string
): Promise<{ key: string; url: string }> {
  // Validate slug
  if (!isValidSlug(slug)) {
    throw new Error(`Invalid slug: ${slug}`);
  }
  
  const client = getStorageClient();
  if (!client) {
    throw new Error('Storage is not configured. Set S3_* environment variables.');
  }
  
  const key = `pages/${slug}/index.html`;
  const cacheControl = getHtmlCacheControl();
  
  const result = await client.upload(key, html, {
    contentType: 'text/html; charset=utf-8',
    cacheControl,
    metadata: {
      'published-at': new Date().toISOString(),
    },
  });
  
  return {
    key: result.key,
    url: result.publicUrl,
  };
}

/**
 * Upload a user asset (image).
 */
export async function uploadAsset(
  userId: string,
  filename: string,
  data: Buffer,
  contentType: string
): Promise<UploadResult> {
  const client = getStorageClient();
  if (!client) {
    throw new Error('Storage is not configured. Set S3_* environment variables.');
  }
  
  // Generate unique key
  const ext = filename.split('.').pop() || 'bin';
  const uuid = crypto.randomUUID();
  const key = `assets/${userId}/${uuid}.${ext}`;
  
  return client.upload(key, data, {
    contentType,
    cacheControl: 'public, max-age=31536000, immutable', // 1 year, content-addressed
  });
}

/**
 * Get the canonical public URL for a page.
 * Always returns the app-served canonical path.
 */
export function getPagePublicUrl(slug: string): string {
  // canonical url is always /{slug} - served by the app, not R2 directly
  return `/${slug}`;
}

/**
 * Delete a published page.
 */
export async function deletePageHtml(slug: string): Promise<void> {
  const client = getStorageClient();
  if (!client) return;
  
  const key = `pages/${slug}/index.html`;
  await client.delete(key);
}

/**
 * Fetch published page HTML from storage.
 * Returns null if the page does not exist.
 * Throws if storage is not configured or fetch fails.
 */
export async function getPageHtml(slug: string): Promise<string | null> {
  // validate slug format
  if (!isValidSlug(slug)) {
    return null;
  }
  
  const client = getStorageClient();
  if (!client) {
    throw new Error('Storage is not configured');
  }
  
  const key = `pages/${slug}/index.html`;
  return client.get(key);
}

/**
 * Check if a published page exists in storage.
 */
export async function pageExists(slug: string): Promise<boolean> {
  if (!isValidSlug(slug)) {
    return false;
  }
  
  const client = getStorageClient();
  if (!client) {
    return false;
  }
  
  const key = `pages/${slug}/index.html`;
  return client.exists(key);
}
