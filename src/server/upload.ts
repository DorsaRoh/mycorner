/**
 * File upload router.
 * Handles image uploads with validation.
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { uploadFile, generateFilename, isUsingSupabase } from './storage';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

// Use memory storage - we'll pass buffer to storage adapter
const storage = multer.memoryStorage();

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
    return;
  }
  cb(null, true);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE, files: 1 } });

export interface UploadResponse {
  url: string;
  mime: string;
  size: number;
  originalName: string;
}

function handleUploadError(err: Error, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'File too large. Maximum size is 15MB.', code: 'FILE_TOO_LARGE' });
    return;
  }
  if (err.message.startsWith('Unsupported file type')) {
    res.status(415).json({ error: err.message, code: 'UNSUPPORTED_TYPE' });
    return;
  }
  next(err);
}

// Wrapper middleware to catch multer errors
function multerErrorHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      return handleUploadError(err as Error, req, res, next);
    }
    next();
  });
}

export function createUploadRouter(): Router {
  const router = Router();

  router.post(
    '/upload',
    multerErrorHandler,
    async (req: Request, res: Response) => {
      if (!req.file) {
        res.status(400).json({ error: 'No file provided.', code: 'NO_FILE' });
        return;
      }

      const filename = generateFilename(req.file.originalname);
      const result = await uploadFile(req.file.buffer, filename, req.file.mimetype);

      if (!result.success) {
        res.status(500).json({ error: result.error || 'Upload failed', code: 'UPLOAD_FAILED' });
        return;
      }

      res.status(201).json({
        url: result.url,
        mime: req.file.mimetype,
        size: req.file.size,
        originalName: req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100),
      });
    }
  );

  // Health check for storage
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      storage: isUsingSupabase() ? 'supabase' : 'local',
      status: 'ok',
    });
  });

  return router;
}
