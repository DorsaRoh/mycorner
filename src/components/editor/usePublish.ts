/**
 * Publish hook for the Editor component.
 * 
 * PRODUCTION ARCHITECTURE:
 * Uses the new /api/publish REST endpoint which:
 * 1. Validates PageDoc with Zod
 * 2. Renders static HTML
 * 3. Uploads to object storage
 * 4. Updates DB
 * 5. Purges CDN
 */

import { useCallback } from 'react';
import { useRouter } from 'next/router';
import type { Block, BackgroundConfig } from '@/shared/types';
import type { PageDoc } from '@/lib/schema/page';
import { legacyBlocksToPageDoc, clearDraft } from '@/lib/draft';

// =============================================================================
// Types
// =============================================================================

interface MeData {
  me?: { id: string; username?: string } | null;
}

interface PublishHookProps {
  pageId: string;
  mode: 'draft' | 'server';
  blocks: Block[];
  title: string;
  background: BackgroundConfig | undefined;
  initialServerRevision: number;
  meData: MeData | undefined;
  refetchMe: () => Promise<{ data?: MeData }>;
  setPublishing: (publishing: boolean) => void;
  setPublishError: (error: string | null) => void;
  setIsPublished: (published: boolean) => void;
  setPublishedRevision: (revision: number | null) => void;
  setPublishedUrl: (url: string | null) => void;
  setShowPublishToast: (show: boolean) => void;
  setShowAuthGate: (show: boolean) => void;
}

interface PublishOptions {
  redirectTo?: string;
}

// =============================================================================
// Hook
// =============================================================================

export function usePublish({
  pageId,
  mode,
  blocks,
  title,
  background,
  initialServerRevision,
  meData,
  refetchMe,
  setPublishing,
  setPublishError,
  setIsPublished,
  setPublishedRevision,
  setPublishedUrl,
  setShowPublishToast,
  setShowAuthGate,
}: PublishHookProps) {
  const router = useRouter();

  const handlePublish = useCallback(async (options?: PublishOptions) => {
    console.log('[Publish] === Starting publish ===');
    console.log('[Publish] mode:', mode);
    console.log('[Publish] blocks:', blocks.length);
    
    // Check auth
    let isAuthenticated = !!meData?.me;
    
    try {
      const { data: freshMe } = await refetchMe();
      isAuthenticated = !!freshMe?.me;
    } catch (error) {
      console.warn('[Publish] Auth refetch failed, using cached state');
    }
    
    if (!isAuthenticated) {
      console.log('[Publish] Not authenticated, showing auth gate');
      // Store intent for after auth
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('publishIntent', JSON.stringify({
          pageId,
          timestamp: Date.now(),
        }));
      }
      setShowAuthGate(true);
      return;
    }
    
    setPublishing(true);
    setPublishError(null);
    
    try {
      // Convert blocks to PageDoc format
      const doc: PageDoc = {
        version: 1,
        title: title || undefined,
        bio: undefined,
        themeId: 'default', // TODO: Add theme selection to editor
        blocks: legacyBlocksToPageDoc(blocks),
      };
      
      console.log('[Publish] PageDoc:', JSON.stringify(doc, null, 2));
      
      // Call new publish API
      const response = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc }),
      });
      
      const result = await response.json();
      console.log('[Publish] API response:', result);
      
      if (!response.ok) {
        // handle storage not configured error with helpful message
        if (response.status === 503 && result.code === 'STORAGE_NOT_CONFIGURED') {
          const missingVars = result.missingEnvVars?.join(', ') || 'unknown';
          const requiredVars = result.requiredEnvVars?.join(', ') || 
            'S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_BASE_URL';
          
          throw new Error(
            `Storage not configured. Missing: ${missingVars}\n\n` +
            `Required environment variables:\n${requiredVars}\n\n` +
            `See docs/SHIP_CHECKLIST.md for deployment setup.`
          );
        }
        
        throw new Error(result.error || 'Failed to publish');
      }
      
      // success!
      setIsPublished(true);
      setPublishedRevision(Date.now()); // use timestamp as revision marker
      
      // use publicUrl from response (points to app domain, not storage url)
      // fallback to /{slug} if publicUrl not provided (legacy)
      const publicUrl = result.publicUrl || `/${result.slug}`;
      setPublishedUrl(publicUrl);
      
      // clear draft
      clearDraft();
      
      // clear any stored publish intent
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('publishIntent');
      }
      
      // redirect to the public page
      // extract path from publicUrl if it's a full url
      let redirectPath: string;
      try {
        const url = new URL(publicUrl);
        redirectPath = url.pathname;
      } catch {
        // publicUrl is already a path
        redirectPath = publicUrl;
      }
      
      const redirectUrl = options?.redirectTo || redirectPath;
      console.log('[Publish] redirecting to:', redirectUrl);
      router.replace(redirectUrl);
      
    } catch (error) {
      console.error('[Publish] Error:', error);
      const message = error instanceof Error ? error.message : 'An error occurred while publishing';
      setPublishError(message);
    } finally {
      setPublishing(false);
    }
  }, [
    pageId,
    mode,
    blocks,
    title,
    background,
    meData?.me,
    refetchMe,
    router,
    setPublishing,
    setPublishError,
    setIsPublished,
    setPublishedRevision,
    setPublishedUrl,
    setShowAuthGate,
  ]);

  return { handlePublish };
}
