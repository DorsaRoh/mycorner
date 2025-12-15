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
import { routes, isDraftId, getPublicUrl } from '@/lib/routes';

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
    // Check authentication
    let isAuthenticated = !!meData?.me;
    if (!isAuthenticated) {
      try {
        const { data: freshMe } = await refetchMe();
        isAuthenticated = !!freshMe?.me;
      } catch {
        isAuthenticated = false;
      }
    }

    if (!isAuthenticated) {
      setAuthContinuation({
        intent: 'publish',
        draftId: pageId,
        returnTo: `/edit/${pageId}`,
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
        // Create server page from draft
        const draft = getDraft(pageId);
        const finalBlocks = blocks.length > 0 ? blocks : (draft?.blocks || []);
        const finalTitle = title || draft?.title || '';
        const finalBackground = background ?? draft?.background;

        const createResult = await createPage({
          variables: { input: { title: finalTitle || undefined } },
        });

        if (createResult.errors?.length) {
          throw new Error(createResult.errors[0].message || 'Failed to create page');
        }

        serverPageId = createResult.data?.createPage?.id;
        if (!serverPageId) throw new Error('Failed to create page');

        // Save content
        const updateResult = await updatePage({
          variables: {
            id: serverPageId,
            input: {
              title: finalTitle || undefined,
              blocks: finalBlocks.map(({ id, type, x, y, width, height, content, style, effects }) => ({
                id, type, x, y, width, height, content, style, effects,
              })),
              background: finalBackground,
              baseServerRevision: 1,
            },
          },
        });

        if (updateResult.errors?.length) {
          throw new Error(updateResult.errors[0].message || 'Failed to save page');
        }

        currentServerRevision = updateResult.data?.updatePage?.currentServerRevision ?? 2;

        // Publish
        const publishResult = await publishPage({
          variables: {
            id: serverPageId,
            input: {
              blocks: finalBlocks.map(({ id, type, x, y, width, height, content, style, effects }) => ({
                id, type, x, y, width, height, content, style, effects,
              })),
              background: finalBackground,
              baseServerRevision: currentServerRevision,
            },
          },
        });

        if (publishResult.errors?.length) {
          throw new Error(publishResult.errors[0].message || 'Failed to publish page');
        }

        const publishData = publishResult.data?.publishPage;
        if (!publishData?.page) throw new Error('Failed to publish page');

        setIsPublished(true);
        setPublishedRevision(publishData.publishedRevision);

        deleteDraft(pageId);
        clearAuthContinuation();

        const publicUrl = publishData.publicUrl
          ? `${window.location.origin}${publishData.publicUrl}`
          : getPublicUrl(serverPageId);

        setPublishToastData(publicUrl);
        router.replace(routes.edit(serverPageId));
      } else {
        // Server mode: flush saves and publish
        currentServerRevision = await saveNow();

        const publishResult = await publishPage({
          variables: {
            id: serverPageId,
            input: {
              blocks: blocks.map(({ id, type, x, y, width, height, content, style, effects }) => ({
                id, type, x, y, width, height, content, style, effects,
              })),
              background,
              baseServerRevision: currentServerRevision,
            },
          },
        });

        if (publishResult.errors?.length) {
          throw new Error(publishResult.errors[0].message || 'Failed to publish page');
        }

        const publishData = publishResult.data?.publishPage;
        if (publishData?.conflict) {
          setPublishError('Content was modified. Please try again.');
          return;
        }

        if (publishData?.page) {
          setIsPublished(true);
          setPublishedRevision(publishData.publishedRevision);

          const publicUrl = publishData.publicUrl
            ? `${window.location.origin}${publishData.publicUrl}`
            : getPublicUrl(serverPageId);
          setPublishedUrl(publicUrl);
          setShowPublishToast(true);
        } else {
          throw new Error('Failed to publish page');
        }
      }
    } catch (error) {
      console.error('Publish failed:', error);
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
