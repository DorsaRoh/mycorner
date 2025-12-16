import { useCallback } from 'react';
import { useRouter } from 'next/router';
import { useMutation } from '@apollo/client';
import type { Block, BackgroundConfig } from '@/shared/types';
import { UPDATE_PAGE, PUBLISH_PAGE, CREATE_PAGE } from '@/lib/graphql/mutations';
import { useSaveController } from '@/lib/hooks/useSaveController';
import {
  setAuthContinuation,
  clearAuthContinuation,
  getDraft,
  deleteDraft,
  setPublishToastData,
} from '@/lib/draft/storage';
import { routes, isDraftId, getAbsoluteUrl } from '@/lib/routes';

// Helper to strip __typename from objects (Apollo Client adds these)
function stripTypename<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(stripTypename) as T;
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key !== '__typename') {
        result[key] = stripTypename(value);
      }
    }
    return result as T;
  }
  return obj;
}

interface PublishHookProps {
  pageId: string;
  mode: 'draft' | 'server';
  blocks: Block[];
  title: string;
  background: BackgroundConfig | undefined;
  initialServerRevision: number;
  meData: any;
  refetchMe: () => Promise<any>;
  setPublishing: (publishing: boolean) => void;
  setPublishError: (error: string | null) => void;
  setIsPublished: (published: boolean) => void;
  setPublishedRevision: (revision: number | null) => void;
  setPublishedUrl: (url: string | null) => void;
  setShowPublishToast: (show: boolean) => void;
  setShowAuthGate: (show: boolean) => void;
}

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
  const [createPage] = useMutation(CREATE_PAGE, { errorPolicy: 'all' });
  const [updatePage] = useMutation(UPDATE_PAGE, { errorPolicy: 'all' });
  const [publishPage] = useMutation(PUBLISH_PAGE, { errorPolicy: 'all' });

  const { saveNow } = useSaveController({
    onSave: async () => ({ success: true, serverRevision: initialServerRevision }),
    initialServerRevision,
    enabled: mode === 'server',
  });

  const handlePublish = useCallback(async () => {
    console.log('[Publish] === handlePublish called ===');
    console.log('[Publish] pageId:', pageId);
    console.log('[Publish] mode:', mode);
    console.log('[Publish] isDraftId:', isDraftId(pageId));
    console.log('[Publish] blocks count:', blocks.length);
    console.log('[Publish] title:', title);
    console.log('[Publish] meData?.me:', meData?.me);

    // Always refetch to ensure we have the latest auth state (handles post-OAuth timing)
    let isAuthenticated = false;
    try {
      console.log('[Publish] Refetching auth state...');
      const { data: freshMe } = await refetchMe();
      console.log('[Publish] Refetch result:', freshMe);
      isAuthenticated = !!freshMe?.me;
    } catch (refetchError) {
      console.error('[Publish] Refetch failed:', refetchError);
      // Fall back to cached data if refetch fails
      isAuthenticated = !!meData?.me;
    }
    console.log('[Publish] isAuthenticated:', isAuthenticated);

    if (!isAuthenticated) {
      console.log('[Publish] Not authenticated, showing auth gate');
      setAuthContinuation({
        intent: 'publish',
        draftId: pageId,
        returnTo: routes.edit(),
      });
      setShowAuthGate(true);
      return;
    }

    setPublishing(true);
    setPublishError(null);

    try {
      let serverPageId = pageId;
      let currentServerRevision = initialServerRevision;

      if (mode === 'draft' || isDraftId(pageId)) {
        console.log('[Publish] Draft mode - creating server page');
        
        // Create server page from draft
        const draft = getDraft(pageId);
        console.log('[Publish] Draft from storage:', draft);
        
        const finalBlocks = blocks.length > 0 ? blocks : (draft?.blocks || []);
        const finalTitle = title || draft?.title || '';
        const finalBackground = background ?? draft?.background;
        
        console.log('[Publish] finalBlocks count:', finalBlocks.length);
        console.log('[Publish] finalTitle:', finalTitle);
        console.log('[Publish] finalBackground:', finalBackground);

        console.log('[Publish] Calling createPage mutation...');
        const createResult = await createPage({
          variables: { input: { title: finalTitle || undefined } },
        });
        console.log('[Publish] createPage result:', JSON.stringify(createResult, null, 2));

        if (createResult.errors?.length) {
          console.error('[Publish] createPage errors:', createResult.errors);
          throw new Error(createResult.errors[0].message || 'Failed to create page');
        }

        serverPageId = createResult.data?.createPage?.id;
        console.log('[Publish] serverPageId:', serverPageId);
        if (!serverPageId) throw new Error('Failed to create page - no ID returned');

        // Save content
        console.log('[Publish] Calling updatePage mutation...');
        const updateResult = await updatePage({
          variables: {
            id: serverPageId,
            input: {
              title: finalTitle || undefined,
              blocks: finalBlocks.map(({ id, type, x, y, width, height, content, style, effects, rotation }) => ({
                id, type, x, y, width, height, content, style, effects, rotation,
              })),
              background: finalBackground,
              baseServerRevision: 1,
            },
          },
        });
        console.log('[Publish] updatePage result:', JSON.stringify(updateResult, null, 2));

        if (updateResult.errors?.length) {
          console.error('[Publish] updatePage errors:', updateResult.errors);
          throw new Error(updateResult.errors[0].message || 'Failed to save page');
        }

        currentServerRevision = updateResult.data?.updatePage?.currentServerRevision ?? 2;
        console.log('[Publish] currentServerRevision:', currentServerRevision);

        // Publish
        console.log('[Publish] Calling publishPage mutation...');
        const publishResult = await publishPage({
          variables: {
            id: serverPageId,
            input: {
              blocks: finalBlocks.map(({ id, type, x, y, width, height, content, style, effects, rotation }) => ({
                id, type, x, y, width, height, content, style, effects, rotation,
              })),
              background: finalBackground,
              baseServerRevision: currentServerRevision,
            },
          },
        });
        console.log('[Publish] publishPage result:', JSON.stringify(publishResult, null, 2));

        if (publishResult.errors?.length) {
          console.error('[Publish] publishPage errors:', publishResult.errors);
          throw new Error(publishResult.errors[0].message || 'Failed to publish page');
        }

        const publishData = publishResult.data?.publishPage;
        console.log('[Publish] publishData:', publishData);
        if (!publishData?.page) throw new Error('Failed to publish page - no page returned');

        console.log('[Publish] Success! Setting published state');
        setIsPublished(true);
        setPublishedRevision(publishData.publishedRevision);

        deleteDraft(pageId);
        clearAuthContinuation();

        // Build public URL - prefer username-based canonical URL
        const publicUrl = publishData.publicUrl
          ? `${window.location.origin}${publishData.publicUrl}`
          : getAbsoluteUrl(routes.user(publishData.page?.owner?.username || ''));
        console.log('[Publish] Redirecting to:', publicUrl);

        // Redirect to published page instead of staying in editor
        router.replace(publicUrl);
      } else {
        console.log('[Publish] Server mode - publishing existing page');
        // Server mode: flush saves and publish
        currentServerRevision = await saveNow();
        console.log('[Publish] After saveNow, currentServerRevision:', currentServerRevision);

        console.log('[Publish] Calling publishPage mutation...');
        const publishResult = await publishPage({
          variables: {
            id: serverPageId,
            input: {
              blocks: blocks.map(({ id, type, x, y, width, height, content, style, effects, rotation }) => 
                stripTypename({ id, type, x, y, width, height, content, style, effects, rotation })
              ),
              background: stripTypename(background),
              baseServerRevision: currentServerRevision,
            },
          },
        });
        console.log('[Publish] publishPage result:', JSON.stringify(publishResult, null, 2));

        if (publishResult.errors?.length) {
          console.error('[Publish] publishPage errors:', publishResult.errors);
          throw new Error(publishResult.errors[0].message || 'Failed to publish page');
        }

        const publishData = publishResult.data?.publishPage;
        if (publishData?.conflict) {
          console.warn('[Publish] Conflict detected');
          setPublishError('Content was modified. Please try again.');
          return;
        }

        if (publishData?.page) {
          console.log('[Publish] Success! Setting published state');
          setIsPublished(true);
          setPublishedRevision(publishData.publishedRevision);

          // Build public URL - prefer username-based canonical URL
          const publicUrl = publishData.publicUrl
            ? `${window.location.origin}${publishData.publicUrl}`
            : getAbsoluteUrl(routes.user(publishData.page?.owner?.username || ''));
          setPublishedUrl(publicUrl);
          setShowPublishToast(true);
        } else {
          throw new Error('Failed to publish page - no page returned');
        }
      }
    } catch (error) {
      console.error('[Publish] === PUBLISH FAILED ===');
      console.error('[Publish] Error:', error);
      console.error('[Publish] Error type:', typeof error);
      console.error('[Publish] Error constructor:', error?.constructor?.name);
      if (error instanceof Error) {
        console.error('[Publish] Error message:', error.message);
        console.error('[Publish] Error stack:', error.stack);
      }
      const message = error instanceof Error ? error.message : 'An error occurred while publishing';
      setPublishError(message);
    } finally {
      setPublishing(false);
      console.log('[Publish] === handlePublish complete ===');
    }
  }, [
    pageId,
    mode,
    blocks,
    title,
    background,
    initialServerRevision,
    meData?.me,
    refetchMe,
    createPage,
    updatePage,
    publishPage,
    saveNow,
    router,
    setPublishing,
    setPublishError,
    setIsPublished,
    setPublishedRevision,
    setPublishedUrl,
    setShowPublishToast,
    setShowAuthGate,
  ]);

  return { handlePublish };
}
