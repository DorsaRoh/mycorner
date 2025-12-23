/**
 * GET /api/debug/published?slug=<slug>
 * 
 * debug endpoint to check if a published page exists in R2.
 * only available in development or to authenticated users.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { pageExists, isValidSlug, isUploadConfigured, getPublicBaseUrl } from '@/server/storage/client';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // only allow in development or for authenticated users
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    // check authentication
    const { getUserFromRequest } = await import('@/server/auth/session');
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
  }
  
  const { slug } = req.query;
  
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'slug query parameter required' });
  }
  
  const normalizedSlug = slug.toLowerCase();
  
  if (!isValidSlug(normalizedSlug)) {
    return res.status(400).json({ 
      error: 'Invalid slug format',
      slug: normalizedSlug,
      valid: false,
    });
  }
  
  const storageConfigured = isUploadConfigured();
  const publicBaseUrl = getPublicBaseUrl();
  
  if (!storageConfigured) {
    return res.status(200).json({
      slug: normalizedSlug,
      storageConfigured: false,
      exists: null,
      message: 'Storage not configured - cannot check R2',
    });
  }
  
  try {
    const exists = await pageExists(normalizedSlug);
    const r2Key = `pages/${normalizedSlug}/index.html`;
    const canonicalUrl = `/${normalizedSlug}`;
    
    return res.status(200).json({
      slug: normalizedSlug,
      storageConfigured: true,
      exists,
      r2Key,
      canonicalUrl,
      publicBaseUrl: publicBaseUrl || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      slug: normalizedSlug,
      storageConfigured: true,
      exists: null,
      error: message,
    });
  }
}

