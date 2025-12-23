/**
 * POST /api/upload
 * 
 * upload endpoint for user assets (images).
 * 
 * features:
 * - authenticated users only
 * - validates file type (images only) via magic bytes
 * - enforces max file size (10MB)
 * - enforces max image dimensions (4096x4096)
 * - enforces per-user storage quota (200MB)
 * - uploads to S3-compatible storage with per-user path
 * - returns public URL
 * 
 * request: json with { file: base64 string }
 * response: { success: true, url: string } or { success: false, error: string }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { uploadAsset, isStorageConfigured } from '@/server/storage/client';
import { applyRateLimit, UPLOAD_LIMIT } from '@/server/rateLimit/index';

// =============================================================================
// configuration
// =============================================================================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_DIMENSION = 4096; // max width or height
const MAX_USER_STORAGE_BYTES = 200 * 1024 * 1024; // 200MB per user

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
]);

// magic bytes for image type detection
const MAGIC_BYTES: Record<string, number[]> = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/gif': [0x47, 0x49, 0x46],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF header (WebP starts with RIFF)
};

// =============================================================================
// in-memory user storage tracking (best-effort)
// in production, this should be stored in DB or redis
// =============================================================================

const userStorageBytes = new Map<string, number>();

function getUserStorageUsed(userId: string): number {
  return userStorageBytes.get(userId) || 0;
}

function addUserStorageUsed(userId: string, bytes: number): void {
  const current = getUserStorageUsed(userId);
  userStorageBytes.set(userId, current + bytes);
}

// =============================================================================
// helpers
// =============================================================================

function detectImageType(buffer: Buffer): string | null {
  for (const [type, magic] of Object.entries(MAGIC_BYTES)) {
    if (magic.every((byte, i) => buffer[i] === byte)) {
      // for webp, also check for WEBP marker at offset 8
      if (type === 'image/webp') {
        const webpMarker = buffer.slice(8, 12).toString('ascii');
        if (webpMarker !== 'WEBP') continue;
      }
      return type;
    }
  }
  return null;
}

function getExtension(contentType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  return map[contentType] || 'bin';
}

/**
 * get image dimensions from header bytes.
 * returns { width, height } or null if unable to parse.
 * 
 * this is a safe, header-only parser - does not decode the full image.
 */
function getImageDimensions(buffer: Buffer, type: string): { width: number; height: number } | null {
  try {
    switch (type) {
      case 'image/png': {
        // PNG: width at offset 16 (4 bytes), height at offset 20 (4 bytes)
        if (buffer.length < 24) return null;
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height };
      }
      
      case 'image/jpeg':
      case 'image/jpg': {
        // JPEG: scan for SOF0 marker (0xFF 0xC0) or SOF2 (0xFF 0xC2)
        let offset = 2;
        while (offset < buffer.length - 8) {
          if (buffer[offset] !== 0xFF) {
            offset++;
            continue;
          }
          const marker = buffer[offset + 1];
          // SOF0, SOF1, SOF2 markers contain dimensions
          if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
            const height = buffer.readUInt16BE(offset + 5);
            const width = buffer.readUInt16BE(offset + 7);
            return { width, height };
          }
          // skip to next marker
          const length = buffer.readUInt16BE(offset + 2);
          offset += 2 + length;
        }
        return null;
      }
      
      case 'image/gif': {
        // GIF: width at offset 6 (2 bytes LE), height at offset 8 (2 bytes LE)
        if (buffer.length < 10) return null;
        const width = buffer.readUInt16LE(6);
        const height = buffer.readUInt16LE(8);
        return { width, height };
      }
      
      case 'image/webp': {
        // WebP: more complex, check VP8/VP8L/VP8X chunk
        if (buffer.length < 30) return null;
        const chunk = buffer.slice(12, 16).toString('ascii');
        
        if (chunk === 'VP8 ') {
          // lossy webp
          const width = (buffer.readUInt16LE(26) & 0x3FFF);
          const height = (buffer.readUInt16LE(28) & 0x3FFF);
          return { width, height };
        } else if (chunk === 'VP8L') {
          // lossless webp
          const bits = buffer.readUInt32LE(21);
          const width = (bits & 0x3FFF) + 1;
          const height = ((bits >> 14) & 0x3FFF) + 1;
          return { width, height };
        } else if (chunk === 'VP8X') {
          // extended webp
          const width = (buffer.readUIntLE(24, 3) + 1);
          const height = (buffer.readUIntLE(27, 3) + 1);
          return { width, height };
        }
        return null;
      }
      
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// =============================================================================
// body parser
// =============================================================================

interface UploadBody {
  file: string; // base64 encoded
  filename?: string;
  contentType?: string;
}

// =============================================================================
// api handler
// =============================================================================

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb', // slightly larger than max to allow for base64 overhead
    },
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }
  
  // rate limiting
  if (!(await applyRateLimit(req, res, UPLOAD_LIMIT))) {
    return; // response already sent
  }
  
  // check authentication
  const user = (req as unknown as Record<string, unknown>).user as { id?: string } | undefined;
  if (!user?.id) {
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication required' 
    });
  }
  
  const userId = user.id;
  
  // check storage configuration
  if (!isStorageConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Storage not configured',
    });
  }
  
  try {
    const body = req.body as UploadBody;
    
    if (!body.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided',
      });
    }
    
    // decode base64
    let buffer: Buffer;
    try {
      // remove data URL prefix if present
      const base64Data = body.file.replace(/^data:[^;]+;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Invalid base64 data',
      });
    }
    
    // check file size
    if (buffer.length > MAX_FILE_SIZE) {
      console.log(`[upload] rejected: file too large (${buffer.length} bytes) for user ${userId}`);
      return res.status(400).json({
        success: false,
        error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
      });
    }
    
    // check per-user quota
    const currentUsage = getUserStorageUsed(userId);
    if (currentUsage + buffer.length > MAX_USER_STORAGE_BYTES) {
      console.log(`[upload] rejected: quota exceeded for user ${userId} (${currentUsage + buffer.length} > ${MAX_USER_STORAGE_BYTES})`);
      return res.status(400).json({
        success: false,
        error: `Storage quota exceeded (max ${MAX_USER_STORAGE_BYTES / 1024 / 1024}MB per user)`,
      });
    }
    
    // detect content type from magic bytes
    const detectedType = detectImageType(buffer);
    if (!detectedType) {
      console.log(`[upload] rejected: invalid image format for user ${userId}`);
      return res.status(400).json({
        success: false,
        error: 'Invalid image format. Allowed: JPEG, PNG, GIF, WebP',
      });
    }
    
    // validate against allowed types
    if (!ALLOWED_TYPES.has(detectedType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid image format. Allowed: JPEG, PNG, GIF, WebP',
      });
    }
    
    // check image dimensions
    const dimensions = getImageDimensions(buffer, detectedType);
    if (dimensions) {
      if (dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION) {
        console.log(`[upload] rejected: dimensions too large (${dimensions.width}x${dimensions.height}) for user ${userId}`);
        return res.status(400).json({
          success: false,
          error: `Image too large. Maximum dimensions: ${MAX_DIMENSION}x${MAX_DIMENSION}`,
        });
      }
    }
    // if we can't parse dimensions, allow it (some edge cases may fail parsing)
    
    // generate filename
    const ext = getExtension(detectedType);
    const filename = body.filename || `image.${ext}`;
    
    // upload to storage
    const result = await uploadAsset(userId, filename, buffer, detectedType);
    
    // update usage tracking (best-effort)
    addUserStorageUsed(userId, buffer.length);
    
    console.log(`[upload] success: ${result.key} (${buffer.length} bytes, ${detectedType}${dimensions ? ` ${dimensions.width}x${dimensions.height}` : ''}) for user ${userId}`);
    
    return res.status(200).json({
      success: true,
      url: result.publicUrl,
      key: result.key,
    });
    
  } catch (error) {
    console.error('[upload] error:', error);
    return res.status(500).json({
      success: false,
      error: 'Upload failed',
    });
  }
}
