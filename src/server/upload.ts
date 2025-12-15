import { Router, Request, Response, NextFunction } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function generateFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase() || '';
  return `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadsDir();
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, generateFilename(file.originalname));
  },
});

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

function handleUploadError(err: Error, req: Request, res: Response, next: NextFunction): void {
  if (req.file?.path && fs.existsSync(req.file.path)) {
    fs.unlinkSync(req.file.path);
  }

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
    (req: Request, res: Response) => {
      if (!req.file) {
        res.status(400).json({ error: 'No file provided.', code: 'NO_FILE' });
        return;
      }

      res.status(201).json({
        url: `/uploads/${req.file.filename}`,
        mime: req.file.mimetype,
        size: req.file.size,
        originalName: req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100),
      });
    }
  );

  return router;
}
