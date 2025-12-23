/**
 * GET /api/health/storage
 * 
 * Diagnostics endpoint for storage configuration.
 * Returns storage configuration status (without secrets).
 * 
 * Security:
 * - In production: requires Authorization: Bearer <HEALTHCHECK_TOKEN>
 * - Returns 404 (not 401) on auth failure to avoid discovery
 * - In development: allows unauthenticated access
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { 
  isUploadConfigured, 
  isPublicPagesConfigured,
  getMissingStorageEnvVars,
  validatePublicBaseUrl,
  REQUIRED_STORAGE_ENV_VARS,
} from '@/server/storage/client';
import { isPurgeConfigured } from '@/server/cdn/purge';

// =============================================================================
// Types
// =============================================================================

interface StorageHealthResponse {
  ok: boolean;
  storageConfigured: boolean;
  publicBaseUrlConfigured: boolean;
  uploadConfigured: boolean;
  cdnPurgeConfigured: boolean;
  missingEnvVars?: string[];
  publicBaseUrlValid?: boolean;
  publicBaseUrlError?: string;
  requiredEnvVars: readonly string[];
}

// =============================================================================
// Auth
// =============================================================================

function isAuthorized(req: NextApiRequest): boolean {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // in development, allow unauthenticated access
  if (!isProduction) {
    return true;
  }
  
  // in production, require HEALTHCHECK_TOKEN
  const token = process.env.HEALTHCHECK_TOKEN;
  if (!token) {
    // if token is not configured, deny all access in production
    console.warn('[health/storage] HEALTHCHECK_TOKEN not configured in production');
    return false;
  }
  
  // check authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return false;
  }
  
  // expect "Bearer <token>"
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return false;
  }
  
  return match[1] === token;
}

// =============================================================================
// Handler
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StorageHealthResponse | { notFound: boolean }>
) {
  // only GET allowed
  if (req.method !== 'GET') {
    // return 404 to avoid leaking endpoint existence
    return res.status(404).json({ notFound: true });
  }
  
  // check authorization - return 404 on failure to avoid discovery
  if (!isAuthorized(req)) {
    return res.status(404).json({ notFound: true });
  }
  
  // gather storage status
  const storageConfigured = isUploadConfigured();
  const publicBaseUrlConfigured = isPublicPagesConfigured();
  const uploadConfigured = isUploadConfigured();
  const cdnPurgeConfigured = isPurgeConfigured();
  const missingEnvVars = getMissingStorageEnvVars();
  
  // validate public base url format
  const publicBaseUrlError = validatePublicBaseUrl();
  const publicBaseUrlValid = publicBaseUrlConfigured && !publicBaseUrlError;
  
  // overall health: ok if storage is fully configured
  const ok = storageConfigured && publicBaseUrlValid;
  
  const response: StorageHealthResponse = {
    ok,
    storageConfigured,
    publicBaseUrlConfigured,
    uploadConfigured,
    cdnPurgeConfigured,
    requiredEnvVars: REQUIRED_STORAGE_ENV_VARS,
  };
  
  // only include details if not fully configured (helpful for debugging)
  if (!ok) {
    if (missingEnvVars.length > 0) {
      response.missingEnvVars = missingEnvVars;
    }
    response.publicBaseUrlValid = publicBaseUrlValid;
    if (publicBaseUrlError) {
      response.publicBaseUrlError = publicBaseUrlError;
    }
  }
  
  // use 503 if not ok (service unavailable), 200 if ok
  const statusCode = ok ? 200 : 503;
  
  return res.status(statusCode).json(response);
}

