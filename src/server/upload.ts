/**
 * Asset upload module
 * Handles file uploads for images and audio with validation and disk storage.
 * Files are stored in /public/uploads/ and accessible via /uploads/<filename>
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// File size limits (in bytes)
const LIMITS = {
  image: 15 * 1024 * 1024, // 15MB for images/gifs
  audio: 25 * 1024 * 1024, // 25MB for audio
};

// Allowed MIME types
const ALLOWED_TYPES = {
  image: [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif',
  ],
  audio: [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/wave',
    'audio/ogg',
    'audio/aac',
    'audio/m4a',
    'audio/x-m4a',
  ],
};

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

// Generate a secure random filename preserving extension
function generateFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase() || '';
  const id = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return `${timestamp}-${id}${ext}`;
}

// Sanitize original filename for logging/return (never use for storage)
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

// Determine asset kind from MIME type
function getAssetKind(mimeType: string): 'image' | 'audio' | null {
  if (ALLOWED_TYPES.image.includes(mimeType)) return 'image';
  if (ALLOWED_TYPES.audio.includes(mimeType)) return 'audio';
  return null;
}

// Configure multer storage - stream directly to disk
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadsDir();
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, generateFilename(file.originalname));
  },
});

// File filter for validation
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  const kind = getAssetKind(file.mimetype);
  
  if (!kind) {
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
    return;
  }
  
  // Store kind on request for later size validation
  (req as Request & { assetKind?: string }).assetKind = kind;
  cb(null, true);
};

// Create multer instance with max possible limit (we validate per-type after)
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: Math.max(LIMITS.image, LIMITS.audio),
    files: 1, // Single file only
  },
});

// Response shape for successful upload
export interface UploadResponse {
  url: string;
  mime: string;
  size: number;
  originalName: string;
}

// Error response shape
interface UploadErrorResponse {
  error: string;
  code: string;
}

// Middleware to handle upload errors gracefully
function handleUploadError(
  err: Error,
  req: Request,
  res: Response<UploadErrorResponse>,
  next: NextFunction
): void {
  // Clean up any partial file if it exists
  if (req.file?.path && fs.existsSync(req.file.path)) {
    fs.unlinkSync(req.file.path);
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: 'File too large. Maximum size is 15MB for images, 25MB for audio.',
        code: 'FILE_TOO_LARGE',
      });
      return;
    }
    res.status(400).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  if (err.message.startsWith('Unsupported file type')) {
    res.status(415).json({
      error: err.message,
      code: 'UNSUPPORTED_TYPE',
    });
    return;
  }

  next(err);
}

// Create the upload router
export function createUploadRouter(): Router {
  const router = Router();

  router.post(
    '/upload',
    upload.single('file'),
    handleUploadError as unknown as (req: Request, res: Response, next: NextFunction) => void,
    (req: Request, res: Response<UploadResponse | UploadErrorResponse>) => {
      if (!req.file) {
        res.status(400).json({
          error: 'No file provided. Include a file field named "file".',
          code: 'NO_FILE',
        });
        return;
      }

      const file = req.file;
      const kind = getAssetKind(file.mimetype);

      // Post-upload size validation per type
      if (kind === 'image' && file.size > LIMITS.image) {
        fs.unlinkSync(file.path);
        res.status(413).json({
          error: `Image too large. Maximum size is ${LIMITS.image / 1024 / 1024}MB.`,
          code: 'FILE_TOO_LARGE',
        });
        return;
      }

      if (kind === 'audio' && file.size > LIMITS.audio) {
        fs.unlinkSync(file.path);
        res.status(413).json({
          error: `Audio too large. Maximum size is ${LIMITS.audio / 1024 / 1024}MB.`,
          code: 'FILE_TOO_LARGE',
        });
        return;
      }

      // Build public URL
      const url = `/uploads/${file.filename}`;

      res.status(201).json({
        url,
        mime: file.mimetype,
        size: file.size,
        originalName: sanitizeFilename(file.originalname),
      });
    }
  );

  return router;
}

// Export for testing
export { LIMITS, ALLOWED_TYPES, UPLOADS_DIR };
