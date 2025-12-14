/**
 * Client-side asset upload utility
 * Uploads files to /api/assets/upload and returns the public URL
 */

export interface UploadResult {
  url: string;
  mime: string;
  size: number;
  originalName: string;
}

interface UploadError {
  error: string;
  code: string;
}

export type UploadOutcome = 
  | { success: true; data: UploadResult }
  | { success: false; error: string; code: string };

/**
 * Upload a file to the server and get a public URL back.
 * Use this for images and audio files to avoid base64 bloat in saves.
 * 
 * @param file - The File to upload
 * @returns Promise with the upload result or error
 */
export async function uploadAsset(file: File): Promise<UploadOutcome> {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/assets/upload', {
      method: 'POST',
      body: formData,
      // Don't set Content-Type header - browser sets it with boundary for multipart
    });

    if (!response.ok) {
      const errorData: UploadError = await response.json().catch(() => ({
        error: 'Upload failed',
        code: 'UNKNOWN_ERROR',
      }));
      return {
        success: false,
        error: errorData.error,
        code: errorData.code,
      };
    }

    const data: UploadResult = await response.json();
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error during upload',
      code: 'NETWORK_ERROR',
    };
  }
}

/**
 * Check if a string is a base64 data URL (which should be uploaded instead)
 */
export function isBase64DataUrl(str: string): boolean {
  return str.startsWith('data:');
}

/**
 * Check if a file type is an accepted image type
 */
export function isAcceptedImageType(mimeType: string): boolean {
  return [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif',
  ].includes(mimeType);
}

/**
 * Check if a file type is an accepted audio type
 */
export function isAcceptedAudioType(mimeType: string): boolean {
  return [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/wave',
    'audio/ogg',
    'audio/aac',
    'audio/m4a',
    'audio/x-m4a',
  ].includes(mimeType);
}
