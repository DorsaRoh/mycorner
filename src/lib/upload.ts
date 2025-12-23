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
 * Upload using the Next.js API route (base64 JSON).
 * This is the fallback when the Express server isn't available.
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
 * Uses the Next.js API route with base64 JSON, which works reliably
 * in all environments (dev, production, containerized).
 */
export async function uploadAsset(file: File): Promise<UploadOutcome> {
  return uploadViaNextApi(file);
}

export function isAcceptedImageType(mimeType: string): boolean {
  return ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(mimeType);
}
