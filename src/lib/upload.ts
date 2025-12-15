export interface UploadResult {
  url: string;
  mime: string;
  size: number;
  originalName: string;
}

export type UploadOutcome = 
  | { success: true; data: UploadResult }
  | { success: false; error: string; code: string };

export async function uploadAsset(file: File): Promise<UploadOutcome> {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/assets/upload', { method: 'POST', body: formData });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Upload failed', code: 'UNKNOWN_ERROR' }));
      return { success: false, error: errorData.error, code: errorData.code };
    }

    const data: UploadResult = await response.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error', code: 'NETWORK_ERROR' };
  }
}

export function isAcceptedImageType(mimeType: string): boolean {
  return ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(mimeType);
}
