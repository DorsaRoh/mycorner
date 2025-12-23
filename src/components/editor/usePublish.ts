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

interface PublishHookProps {
  pageId: string;
  mode: 'draft' | 'server';
  blocks: Block[];
  title: string;
  background: BackgroundConfig | undefined;
  initialServerRevision: number;
  meData: { me?: { id: string; username?: string } } | undefined;
  refetchMe: () => Promise<{ data?: { me?: { id: string; username?: string } } }>;
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
        throw new Error(result.error || 'Failed to publish');
      }
      
      // Success!
      setIsPublished(true);
      setPublishedRevision(Date.now()); // Use timestamp as revision marker
      
      const publicUrl = `/u/${result.slug}`;
      setPublishedUrl(publicUrl);
      
      // Clear draft
      clearDraft();
      
      // Clear any stored publish intent
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('publishIntent');
      }
      
      // Redirect
      const redirectUrl = options?.redirectTo || publicUrl;
      console.log('[Publish] Redirecting to:', redirectUrl);
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
