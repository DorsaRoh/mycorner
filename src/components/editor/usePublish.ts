/**
 * Publish hook for the Editor component.
 * 
 * SIMPLE FLOW:
 * 1. User clicks publish
 * 2. If not logged in → show auth gate
 * 3. After login, if no username → show onboarding modal
 * 4. After username set → publish page
 * 
 * No complex draft tokens or cookie management.
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
  setAuthIntent: (intent: 'signin' | 'publish') => void;
  setShowOnboarding: (show: boolean) => void;
  setPendingPublishAfterOnboarding: (pending: boolean) => void;
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
  meData,
  refetchMe,
  setPublishing,
  setPublishError,
  setIsPublished,
  setPublishedRevision,
  setPublishedUrl,
  setShowAuthGate,
  setAuthIntent,
  setShowOnboarding,
  setPendingPublishAfterOnboarding,
}: PublishHookProps) {
  const router = useRouter();

  const handlePublish = useCallback(async () => {
    console.log('[Publish] === Starting publish ===');
    console.log('[Publish] blocks:', blocks.length);
    
    // Step 1: Check auth
    let user = meData?.me;
    
    // Always refetch to get current auth state
    try {
      const { data: freshMe } = await refetchMe();
      user = freshMe?.me;
    } catch (error) {
      console.warn('[Publish] Auth refetch failed, using cached state');
    }
    
    // Not logged in? Show auth gate
    if (!user) {
      console.log('[Publish] Not authenticated, showing auth gate');
      setAuthIntent('publish');
      setShowAuthGate(true);
      return;
    }
    
    // Step 2: Check if user has username
    if (!user.username) {
      console.log('[Publish] User has no username, showing onboarding');
      setPendingPublishAfterOnboarding(true);
      setShowOnboarding(true);
      return;
    }
    
    // Step 3: Do the actual publish
    setPublishing(true);
    setPublishError(null);
    
    try {
      // Convert blocks to PageDoc format
      const doc: PageDoc = {
        version: 1,
        title: title || undefined,
        bio: undefined,
        themeId: 'default',
        background: background,
        blocks: legacyBlocksToPageDoc(blocks),
      };
      
      console.log('[Publish] Publishing to username:', user.username);
      console.log('[Publish] Blocks count:', doc.blocks.length);
      
      // Call publish API
      const response = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc }),
      });
      
      const result = await response.json();
      console.log('[Publish] API response:', result);
      
      if (!response.ok) {
        // Handle specific errors
        if (response.status === 503 && result.code === 'STORAGE_NOT_CONFIGURED') {
          throw new Error('Storage not configured. See docs/SHIP_CHECKLIST.md for setup.');
        }
        if (result.code === 'USERNAME_REQUIRED') {
          // Shouldn't happen since we checked, but handle gracefully
          console.log('[Publish] Username required, showing onboarding');
          setPendingPublishAfterOnboarding(true);
          setShowOnboarding(true);
          setPublishing(false);
          return;
        }
        throw new Error(result.error || 'Failed to publish');
      }
      
      // Success!
      setIsPublished(true);
      setPublishedRevision(Date.now());
      
      const canonicalPath = result.url || `/${result.slug}`;
      const fullPublicUrl = result.publicUrl || `${window.location.origin}${canonicalPath}`;
      setPublishedUrl(fullPublicUrl);
      
      // Clear draft from localStorage
      clearDraft();
      
      console.log('[Publish] Success! URL:', fullPublicUrl);
      
      // If we were in draft mode, redirect to /edit to load server-side page
      // This ensures user is now editing their real page, not localStorage
      if (mode === 'draft') {
        console.log('[Publish] Redirecting to /edit to load server page');
        router.push('/edit');
        return;
      }
      
    } catch (error) {
      console.error('[Publish] Error:', error);
      const message = error instanceof Error ? error.message : 'An error occurred while publishing';
      setPublishError(message);
    } finally {
      setPublishing(false);
    }
  }, [
    mode,
    router,
    blocks,
    title,
    background,
    meData?.me,
    refetchMe,
    setPublishing,
    setPublishError,
    setIsPublished,
    setPublishedRevision,
    setPublishedUrl,
    setShowAuthGate,
    setAuthIntent,
    setShowOnboarding,
    setPendingPublishAfterOnboarding,
  ]);

  return { handlePublish };
}
