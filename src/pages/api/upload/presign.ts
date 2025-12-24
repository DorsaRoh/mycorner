/**
 * POST /api/upload/presign
 * 
 * Generates a presigned URL for direct client-to-S3 uploads.
 * This is significantly faster than the base64 upload path because:
 * - No base64 encoding overhead (33% smaller payload)
 * - Client uploads directly to S3, not through the server
 * - Server doesn't need to buffer the entire file
 * 
 * Request: { filename: string, contentType: string, size: number }
 * Response: { success: true, uploadUrl: string, publicUrl: string, key: string }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit, UPLOAD_LIMIT } from '@/server/rateLimit/index';
import crypto from 'crypto';

// =============================================================================
// Configuration
// =============================================================================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const PRESIGN_EXPIRY_SECONDS = 300; // 5 minutes

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
]);

// =============================================================================
// S3 Presigned URL Generation (AWS Signature v4)
// =============================================================================

interface StorageConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  region: string;
}

function getStorageConfig(): StorageConfig | null {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET;
  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL || process.env.PUBLIC_PAGES_BASE_URL;
  
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

function sha256(message: string): string {
  return crypto.createHash('sha256').update(message, 'utf8').digest('hex');
}

function hmacSha256(key: Buffer, message: string): Buffer {
  return crypto.createHmac('sha256', key).update(message, 'utf8').digest();
}

function hmacSha256Hex(key: Buffer, message: string): string {
  return crypto.createHmac('sha256', key).update(message, 'utf8').digest('hex');
}

function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Buffer {
  const kDate = hmacSha256(Buffer.from('AWS4' + secretKey), dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

function generatePresignedUrl(
  config: StorageConfig,
  key: string,
  contentType: string,
  expirySeconds: number
): string {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = config.region;
  const service = 's3';
  
  // Parse endpoint URL
  const endpointUrl = new URL(config.endpoint);
  const host = endpointUrl.host;
  const protocol = endpointUrl.protocol;
  
  // Build canonical URI - path-style: /{bucket}/{key}
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  const canonicalUri = `/${config.bucket}/${encodedKey}`;
  
  // Build credential scope
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${config.accessKeyId}/${credentialScope}`;
  
  // Query parameters for presigned URL
  const queryParams = new Map<string, string>([
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', credential],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', expirySeconds.toString()],
    ['X-Amz-SignedHeaders', 'content-type;host'],
  ]);
  
  // Build canonical query string (sorted)
  const sortedParams = Array.from(queryParams.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const canonicalQueryString = sortedParams
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  
  // Build canonical headers (for presigned PUT, we include content-type)
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const signedHeaders = 'content-type;host';
  
  // For presigned URLs, payload is UNSIGNED-PAYLOAD
  const payloadHash = 'UNSIGNED-PAYLOAD';
  
  // Build canonical request
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  
  // Build string to sign
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');
  
  // Calculate signature
  const signingKey = getSignatureKey(config.secretAccessKey, dateStamp, region, service);
  const signature = hmacSha256Hex(signingKey, stringToSign);
  
  // Build final URL
  const finalQueryString = `${canonicalQueryString}&X-Amz-Signature=${signature}`;
  return `${protocol}//${host}${canonicalUri}?${finalQueryString}`;
}

// =============================================================================
// API Handler
// =============================================================================

interface PresignRequest {
  filename: string;
  contentType: string;
  size: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }
  
  // Rate limiting
  if (!(await applyRateLimit(req, res, UPLOAD_LIMIT))) {
    return; // response already sent
  }
  
  // Check authentication
  const { getUserFromRequest, getAnonymousIdFromRequest } = await import('@/server/auth/session');
  const user = await getUserFromRequest(req);
  
  let userId: string;
  if (user?.id) {
    userId = user.id;
  } else {
    const anonymousId = await getAnonymousIdFromRequest(req, res);
    if (!anonymousId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Session required' 
      });
    }
    userId = anonymousId;
  }
  
  // Check storage configuration
  const config = getStorageConfig();
  if (!config) {
    return res.status(503).json({
      success: false,
      error: 'Storage not configured',
    });
  }
  
  try {
    const body = req.body as PresignRequest;
    
    // Validate request
    if (!body.filename || !body.contentType || !body.size) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: filename, contentType, size',
      });
    }
    
    // Validate content type
    if (!ALLOWED_TYPES.has(body.contentType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid image format. Allowed: JPEG, PNG, GIF, WebP',
      });
    }
    
    // Validate file size
    if (body.size > MAX_FILE_SIZE) {
      return res.status(400).json({
        success: false,
        error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
      });
    }
    
    // Generate unique key
    const ext = body.filename.split('.').pop()?.toLowerCase() || 'bin';
    const uuid = crypto.randomUUID();
    const key = `assets/${userId}/${uuid}.${ext}`;
    
    // Generate presigned URL
    const uploadUrl = generatePresignedUrl(
      config,
      key,
      body.contentType,
      PRESIGN_EXPIRY_SECONDS
    );
    
    const publicUrl = `${config.publicBaseUrl}/${key}`;
    
    console.log(`[presign] generated URL for ${key} (${body.size} bytes, ${body.contentType}) for user ${userId}`);
    
    return res.status(200).json({
      success: true,
      uploadUrl,
      publicUrl,
      key,
    });
    
  } catch (error) {
    console.error('[presign] error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate upload URL',
    });
  }
}

