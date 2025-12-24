export interface UploadResult {
  url: string;
  mime: string;
  size: number;
  originalName: string;
}

export type UploadOutcome = 
  | { success: true; data: UploadResult }
  | { success: false; error: string; code: string };

/**
 * Convert a File to base64 string.
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Upload using presigned URL (direct to S3/R2).
 * This is the fast path - uploads directly to storage without going through the server.
 */
async function uploadViaPresignedUrl(file: File): Promise<UploadOutcome> {
  try {
    // Step 1: Get presigned URL from server
    const presignResponse = await fetch('/api/upload/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        size: file.size,
      }),
    });

    if (!presignResponse.ok) {
      const errorData = await presignResponse.json().catch(() => ({ error: 'Failed to get upload URL' }));
      return { success: false, error: errorData.error, code: 'PRESIGN_ERROR' };
    }

    const { uploadUrl, publicUrl } = await presignResponse.json();

    // Step 2: Upload directly to S3/R2 using the presigned URL
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
      },
      body: file, // Direct file upload - no base64 encoding!
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text().catch(() => 'Upload failed');
      console.error('[upload] Direct upload failed:', uploadResponse.status, errorText);
      return { success: false, error: 'Direct upload failed', code: 'DIRECT_UPLOAD_ERROR' };
    }

    return { 
      success: true, 
      data: {
        url: publicUrl,
        mime: file.type,
        size: file.size,
        originalName: file.name,
      }
    };
  } catch (err) {
    console.error('[upload] Presigned upload error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Network error', code: 'NETWORK_ERROR' };
  }
}

/**
 * Upload using the Next.js API route (base64 JSON).
 * This is the fallback when presigned URLs aren't available (e.g., local dev without S3).
 */
async function uploadViaNextApi(file: File): Promise<UploadOutcome> {
  try {
    const base64Data = await fileToBase64(file);
    
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: base64Data,
        filename: file.name,
        contentType: file.type,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Upload failed', code: 'UNKNOWN_ERROR' }));
      return { success: false, error: errorData.error, code: errorData.code || 'UPLOAD_ERROR' };
    }

    const data = await response.json();
    return { 
      success: true, 
      data: {
        url: data.url,
        mime: file.type,
        size: file.size,
        originalName: file.name,
      }
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error', code: 'NETWORK_ERROR' };
  }
}

/**
 * Upload a file to the server.
 * 
 * Uses presigned URLs for direct-to-S3 uploads in production (fast path).
 * Falls back to base64 JSON upload through the server if presigned fails.
 */
export async function uploadAsset(file: File): Promise<UploadOutcome> {
  // Try the fast path first: presigned URL for direct upload
  const presignedResult = await uploadViaPresignedUrl(file);
  
  if (presignedResult.success) {
    return presignedResult;
  }
  
  // If presigned URL failed due to storage not configured, fall back to base64
  // This handles local development without S3 configured
  if (presignedResult.code === 'PRESIGN_ERROR') {
    console.log('[upload] Presigned URL not available, falling back to base64 upload');
    return uploadViaNextApi(file);
  }
  
  // For other errors (e.g., network issues during direct upload), also try fallback
  console.log('[upload] Direct upload failed, trying fallback:', presignedResult.error);
  return uploadViaNextApi(file);
}

export function isAcceptedImageType(mimeType: string): boolean {
  return ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(mimeType);
}
