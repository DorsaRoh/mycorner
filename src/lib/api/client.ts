/**
 * Typed API client for my-corner.
 * 
 * All API calls should use these helpers instead of direct fetch().
 * This ensures consistent URL construction, error handling, and typing.
 */

import { api } from '../routes';

// =============================================================================
// Types
// =============================================================================

export interface ApiError {
  error: string;
  code?: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface MeResponse {
  authenticated: boolean;
  user: {
    id: string;
    email: string;
    name: string;
    username: string | null;
    avatarUrl: string | null;
    createdAt?: string;
  } | null;
}

export interface PublishRequest {
  pageId: string;
  blocks: unknown[];
  background?: unknown;
  baseServerRevision: number;
}

export interface PublishResponse {
  success: boolean;
  error?: string;
  conflict?: boolean;
  currentServerRevision?: number;
  page?: {
    id: string;
    title: string;
    slug: string | null;
    isPublished: boolean;
  };
  publishedRevision?: number;
  publishedAt?: string;
  publicUrl?: string;
}

export interface UploadResponse {
  url: string;
  mime: string;
  size: number;
  originalName: string;
}

export interface HealthResponse {
  status: string;
  env?: string;
  timestamp?: string;
}

export interface StorageHealthResponse {
  storage: 'supabase' | 'local';
  status: string;
}

// =============================================================================
// Base fetch helper
// =============================================================================

async function apiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        data: null,
        error: errorData.error || `Request failed with status ${response.status}`,
      };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

// =============================================================================
// API Methods
// =============================================================================

/**
 * Get current user info.
 */
export async function getMe(): Promise<ApiResponse<MeResponse>> {
  return apiRequest<MeResponse>(api.me());
}

/**
 * Publish a page via REST API.
 * Note: Most publish operations go through GraphQL instead.
 */
export async function publishPage(
  request: PublishRequest
): Promise<ApiResponse<PublishResponse>> {
  return apiRequest<PublishResponse>(api.publish(), {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Upload a file.
 */
export async function uploadFile(file: File): Promise<ApiResponse<UploadResponse>> {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(api.upload(), {
      method: 'POST',
      body: formData,
      credentials: 'include',
      // Don't set Content-Type header - browser will set it with boundary for FormData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        data: null,
        error: errorData.error || `Upload failed with status ${response.status}`,
      };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

/**
 * Check server health.
 */
export async function getHealth(): Promise<ApiResponse<HealthResponse>> {
  return apiRequest<HealthResponse>(api.health());
}

/**
 * Check storage health.
 */
export async function getStorageHealth(): Promise<ApiResponse<StorageHealthResponse>> {
  return apiRequest<StorageHealthResponse>(api.assetsHealth());
}

