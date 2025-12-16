/**
 * File storage adapter - switches between local disk (dev) and Supabase Storage (prod).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from '../lib/config';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const config = getConfig();

// =============================================================================
// Storage interface
// =============================================================================

export interface StorageResult {
  success: boolean;
  url?: string;
  error?: string;
}

// =============================================================================
// Supabase Storage (production)
// =============================================================================

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabase) {
    if (!config.supabaseUrl || !config.supabaseServiceKey) {
      throw new Error('Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.');
    }
    supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }
  return supabase;
}

async function uploadToSupabase(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<StorageResult> {
  try {
    const client = getSupabase();
    const bucket = config.supabaseStorageBucket;

    // Check if bucket exists, create if needed
    const { data: buckets } = await client.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === bucket);
    
    if (!bucketExists) {
      const { error: createError } = await client.storage.createBucket(bucket, { public: true });
      if (createError) {
        // If creation fails due to permissions, it's likely an auth issue
        console.error('Failed to create bucket:', createError);
        if (createError.message?.includes('row-level security') || createError.message?.includes('policy')) {
          return { 
            success: false, 
            error: 'Storage permission denied. Ensure SUPABASE_SERVICE_KEY is the service_role key (not anon key).' 
          };
        }
        return { success: false, error: `Bucket creation failed: ${createError.message}` };
      }
      console.log(`Created storage bucket: ${bucket}`);
    }

    // Upload file
    const { error } = await client.storage
      .from(bucket)
      .upload(filename, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      console.error('Supabase upload error:', error);
      // Provide clearer error message for RLS issues
      if (error.message?.includes('row-level security') || error.message?.includes('policy')) {
        return { 
          success: false, 
          error: 'Storage permission denied. Ensure SUPABASE_SERVICE_KEY is the service_role key (not anon key), or check bucket RLS policies.' 
        };
      }
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: urlData } = client.storage.from(bucket).getPublicUrl(filename);

    return { success: true, url: urlData.publicUrl };
  } catch (err) {
    console.error('Storage error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Upload failed' };
  }
}

// =============================================================================
// Local disk storage (development)
// =============================================================================

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

async function uploadToLocal(
  buffer: Buffer,
  filename: string,
  _mimeType: string
): Promise<StorageResult> {
  try {
    ensureUploadsDir();
    const filePath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    return { success: true, url: `/uploads/${filename}` };
  } catch (err) {
    console.error('Local storage error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Upload failed' };
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate a unique filename for uploaded files.
 */
export function generateFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase() || '';
  return `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`;
}

/**
 * Check if we're using Supabase storage (production).
 */
export function isUsingSupabase(): boolean {
  return !!(config.supabaseUrl && config.supabaseServiceKey);
}

/**
 * Upload a file buffer to storage.
 * Uses Supabase in production, local disk in development.
 * In development, falls back to local storage if Supabase fails.
 */
export async function uploadFile(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<StorageResult> {
  if (isUsingSupabase()) {
    const result = await uploadToSupabase(buffer, filename, mimeType);
    
    // In development, fall back to local storage if Supabase fails
    if (!result.success && config.isDev) {
      console.warn('⚠️  Supabase upload failed, falling back to local storage:', result.error);
      return uploadToLocal(buffer, filename, mimeType);
    }
    
    return result;
  }
  return uploadToLocal(buffer, filename, mimeType);
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(filename: string): Promise<void> {
  if (isUsingSupabase()) {
    const client = getSupabase();
    await client.storage.from(config.supabaseStorageBucket).remove([filename]);
  } else {
    const filePath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

