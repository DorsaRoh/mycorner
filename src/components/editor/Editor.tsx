import { useEffect, useRef, useCallback, useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, gql, useMutation } from '@apollo/client';
import type { Block as BlockType, BackgroundConfig } from '@/shared/types';
import { UPDATE_PAGE, PUBLISH_PAGE } from '@/lib/graphql/mutations';
import { useSaveController } from '@/lib/hooks/useSaveController';
import { uploadAsset, isAcceptedImageType } from '@/lib/upload';
import {
  getDraft,
  saveDraft,
  deleteDraft,
  setActiveDraftId,
  getAuthContinuation,
  clearAuthContinuation,
  hasStarterBeenDismissed,
  setPublishToastData,
  getPublishToastData,
  clearPublishToastData,
} from '@/lib/draft/storage';
import { routes, isDraftId } from '@/lib/routes';
import {
  createStarterBlocks,
  HINT_BLOCK_ID,
  DEFAULT_STARTER_BACKGROUND,
  STARTER_BLOCK_PREFIX,
} from '@/lib/starter';
import { useViewportMode, VIEWPORT_BREAKPOINT } from '@/lib/canvas';

import { Canvas } from './Canvas';
import { BackgroundPanel } from './BackgroundPanel';
import { AuthGate } from './AuthGate';
import { PublishToast } from './PublishToast';
import { OnboardingModal } from './OnboardingModal';
import { ProductFeedbackModal } from '../viewer/ProductFeedbackModal';
import styles from './Editor.module.css';

import { isImageUrl, getBackgroundBrightness } from '@/shared/utils/blockStyles';
import { useEditorState } from './useEditorState';
import { useEditorActions } from './useEditorActions';
import { useHistory } from './useHistory';
import { usePublish } from './usePublish';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

const ME_QUERY = gql`
  query Me {
    me {
      id
      email
      name
      username
      avatarUrl
    }
  }
`;

interface EditorProps {
  pageId: string;
  mode: 'draft' | 'server';
  initialBlocks?: BlockType[];
  initialTitle?: string;
  initialBackground?: BackgroundConfig;
  initialPublished?: boolean;
  initialServerRevision?: number;
  initialPublishedRevision?: number | null;
}

export function Editor({
  pageId,
  mode,
  initialBlocks = [],
  initialTitle = '',
  initialBackground,
  initialPublished = false,
  initialServerRevision = 1,
  initialPublishedRevision = null,
}: EditorProps) {
  const router = useRouter();

  // Queries
  const { data: meData, loading: meLoading, refetch: refetchMe } = useQuery(ME_QUERY);

  // Initialize state with hooks
  const state = useEditorState(
    initialBlocks,
    initialTitle,
    initialBackground ?? DEFAULT_STARTER_BACKGROUND,
    initialPublished,
    initialPublishedRevision
  );

  // Initialize actions
  const actions = useEditorActions(
    pageId,
    state.blocks,
    state.starterMode,
    state.selectedId,
    state.selectedIds,
    {
      setBlocks: state.setBlocks,
      setSelectedId: state.setSelectedId,
      setSelectedIds: state.setSelectedIds,
      setEditingId: state.setEditingId,
      setNewBlockIds: state.setNewBlockIds,
      setStarterMode: state.setStarterMode,
    }
  );

  // Initialize history
  const history = useHistory(
    state.blocks,
    state.background,
    state.setBlocks,
    state.setBackground
  );

  // Initialize publish hook
  const { handlePublish } = usePublish({
    pageId,
    mode,
    blocks: state.blocks,
    title: state.title,
    background: state.background,
    initialServerRevision,
    meData: meData,
    refetchMe,
    setPublishing: state.setPublishing,
    setPublishError: state.setPublishError,
    setIsPublished: state.setIsPublished,
    setPublishedRevision: state.setPublishedRevision,
    setPublishedUrl: state.setPublishedUrl,
    setShowPublishToast: state.setShowPublishToast,
    setShowAuthGate: state.setShowAuthGate,
  });

  // Handle first interaction - removes the hint block from canvas
  const handleFirstInteraction = useCallback(() => {
    state.setBlocks(prev => prev.filter(b => b.id !== HINT_BLOCK_ID));
  }, [state]);

  // Initialize keyboard shortcuts
  useKeyboardShortcuts({
    selectedId: state.selectedId,
    selectedIds: state.selectedIds,
    blocks: state.blocks,
    editingId: state.editingId,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    onUndo: history.undo,
    onRedo: history.redo,
    onDeleteSelected: actions.handleDeleteSelected,
    onSelectAll: () => state.setSelectedIds(new Set(state.blocks.map(b => b.id))),
    onEscape: () => {
      state.setSelectedId(null);
      state.setSelectedIds(new Set());
    },
    onSetEditing: state.setEditingId,
    onFirstInteraction: handleFirstInteraction,
  });

  // Initialize save controller for server mode
  const handleServerSave = useCallback(async (localRevision: number, baseServerRevision: number) => {
    try {
      const result = await updatePage({
        variables: {
          id: pageId,
          input: {
            title: state.title || null,
            blocks: state.blocks.map(({ id, type, x, y, width, height, content, style, effects, rotation }) => ({
              id, type, x, y, width, height, content, style, effects, rotation,
            })),
            background: state.background,
            localRevision,
            baseServerRevision,
          },
        },
      });

      const data = result.data?.updatePage;
      if (!data) {
        return { success: false, error: { code: 'UNKNOWN' as const, message: 'No response from server' } };
      }

      if (data.conflict) {
        return {
          success: false,
          error: { code: 'CONFLICT' as const, message: 'Document was modified elsewhere', serverRevision: data.currentServerRevision },
        };
      }

      return {
        success: true,
        serverRevision: data.currentServerRevision,
        updatedAt: data.page?.updatedAt,
        acceptedLocalRevision: data.acceptedLocalRevision,
      };
    } catch (error) {
      console.error('[Save] Error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('413') || message.toLowerCase().includes('payload too large')) {
        return { success: false, error: { code: 'PAYLOAD_TOO_LARGE' as const, message: 'Document too large to save' } };
      }
      if (message.includes('Network') || message.includes('fetch')) {
        return { success: false, error: { code: 'NETWORK' as const, message: 'Network error' } };
      }
      return { success: false, error: { code: 'UNKNOWN' as const, message } };
    }
  }, [pageId, state.title, state.blocks, state.background]);

  const [updatePage] = useMutation(UPDATE_PAGE, { errorPolicy: 'all' });
  const [publishPage] = useMutation(PUBLISH_PAGE, { errorPolicy: 'all' });

  const { markDirty } = useSaveController({
    debounceMs: 1000,
    onSave: handleServerSave,
    initialServerRevision,
    onConflict: () => state.setShowConflictModal(true),
    enabled: mode === 'server',
  });

  // Initialize draft from localStorage for draft mode
  const draftLoaded = useRef(false);
  useEffect(() => {
    if (mode === 'draft' && !draftLoaded.current) {
      draftLoaded.current = true;
      setActiveDraftId(pageId);
      const draft = getDraft(pageId);
      if (draft) {
        state.setTitle(draft.title || '');
        state.setBlocks(draft.blocks || []);
        state.setBackground(draft.background ?? DEFAULT_STARTER_BACKGROUND);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pageId]);

  // Check for pending publish toast on mount
  const toastChecked = useRef(false);
  useEffect(() => {
    if (toastChecked.current) return;
    toastChecked.current = true;
    const toastData = getPublishToastData();
    if (toastData) {
      state.setPublishedUrl(toastData.url);
      state.setShowPublishToast(true);
      state.setIsPublished(true);
      clearPublishToastData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Use viewport mode hook for responsive starter layout
  const { mode: viewportMode, isMounted: viewportMounted } = useViewportMode({
    breakpoint: VIEWPORT_BREAKPOINT,
  });
  
  // Track if the page is pristine (only contains untouched starter blocks)
  // This determines if we can safely swap layouts on resize
  const isPristine = useCallback(() => {
    if (!state.starterMode) return false;
    if (state.blocks.length === 0) return true;
    // Check if all blocks are starter blocks (haven't been edited)
    return state.blocks.every(block => 
      block.id.startsWith(STARTER_BLOCK_PREFIX) && block.isStarter === true
    );
  }, [state.blocks, state.starterMode]);
  
  // Track the viewport mode that was used to create current starter blocks
  const starterViewportModeRef = useRef<'mobile' | 'desktop' | null>(null);

  // Add starter blocks for empty draft pages
  const starterBlockAdded = useRef(false);
  useEffect(() => {
    // Wait for viewport to be mounted to get accurate mode
    if (!viewportMounted) return;
    
    if (mode === 'draft' && state.blocks.length === 0 && !starterBlockAdded.current) {
      const draft = getDraft(pageId);
      if ((!draft || draft.blocks.length === 0) && !hasStarterBeenDismissed(pageId)) {
        starterBlockAdded.current = true;
        const isMobile = viewportMode === 'mobile';
        const starterBlocks = createStarterBlocks(isMobile);
        starterViewportModeRef.current = viewportMode;
        state.setBlocks(starterBlocks);
        state.setStarterMode(true);
        state.setSelectedId(null);
        state.setEditingId(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pageId, state.blocks.length, viewportMounted, viewportMode]);

  // Handle viewport mode change - swap starter layout if still pristine
  useEffect(() => {
    // Only swap if:
    // 1. Viewport is mounted
    // 2. Page is still pristine (only untouched starter blocks)
    // 3. Viewport mode changed from what was used to create current starters
    if (!viewportMounted) return;
    if (!isPristine()) return;
    if (starterViewportModeRef.current === null) return;
    if (starterViewportModeRef.current === viewportMode) return;
    
    // Swap to the new layout
    const isMobile = viewportMode === 'mobile';
    const starterBlocks = createStarterBlocks(isMobile);
    starterViewportModeRef.current = viewportMode;
    state.setBlocks(starterBlocks);
    // Keep starterMode true since we're just swapping starter layouts
  }, [viewportMode, viewportMounted, isPristine, state]);

  // Mark dirty for server mode
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (mode === 'server') {
      if (isFirstRender.current) {
        isFirstRender.current = false;
        return;
      }
      markDirty();
    }
  }, [mode, state.blocks, state.title, state.background, markDirty]);

  // Auto-save to localStorage for draft mode
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (mode !== 'draft') return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveDraft({
        id: pageId,
        title: state.title,
        blocks: state.blocks,
        background: state.background,
        createdAt: getDraft(pageId)?.createdAt || Date.now(),
        updatedAt: Date.now(),
      });
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [mode, pageId, state.title, state.blocks, state.background]);

  // Handle onboarding completion
  const pendingPublishHandled = useRef(false);
  const handleOnboardingComplete = useCallback(async (username: string, pageTitle: string, newPageId: string) => {
    state.setShowOnboarding(false);
    await refetchMe();

    if (state.pendingPublishAfterOnboarding) {
      state.setPendingPublishAfterOnboarding(false);
      pendingPublishHandled.current = true;
      clearAuthContinuation();

      const draft = getDraft(pageId);
      const blocksToPublish = draft?.blocks || state.blocks;
      const backgroundToPublish = draft?.background || state.background;
      const titleToPublish = draft?.title || state.title || pageTitle;

      state.setPublishing(true);
      state.setPublishError(null);

      try {
        const { data: publishData } = await publishPage({
          variables: {
            id: newPageId,
            input: {
              blocks: blocksToPublish.map(({ id, type, x, y, width, height, content, style, effects }) => ({
                id, type, x, y, width, height, content, style, effects,
              })),
              background: backgroundToPublish,
              baseServerRevision: 1,
            },
          },
        });

        if (publishData?.publishPage?.page) {
          state.setIsPublished(true);
          state.setPublishedRevision(publishData.publishPage.publishedRevision);
          deleteDraft(pageId);

          const publicUrl = publishData.publishPage.publicUrl
            ? `${window.location.origin}${publishData.publishPage.publicUrl}`
            : routes.view(newPageId, username);

          // Redirect to published page instead of staying in editor
          router.replace(publicUrl);
        } else {
          throw new Error('Failed to publish page');
        }
      } catch (error) {
        console.error('Publish after onboarding failed:', error);
        state.setPublishing(false);
        state.setPublishError(error instanceof Error ? error.message : 'Publish failed');
        router.push(routes.edit(newPageId));
      }
    } else {
      router.push(routes.edit(newPageId));
    }
  }, [pageId, state, refetchMe, router]);

  // Check for pending publish after auth or show onboarding
  useEffect(() => {
    if (meLoading || pendingPublishHandled.current) return;

    const urlParams = new URLSearchParams(window.location.search);
    const needsOnboarding = urlParams.get('onboarding') === 'true' || (meData?.me && !meData.me.username);

    if (urlParams.has('onboarding') || urlParams.has('error')) {
      urlParams.delete('onboarding');
      urlParams.delete('error');
      const newUrl = urlParams.toString()
        ? `${window.location.pathname}?${urlParams.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }

    const continuation = getAuthContinuation();

    if (meData?.me) {
      if (continuation && continuation.draftId !== pageId) {
        router.replace(`/edit/${continuation.draftId}`);
        return;
      }

      if (needsOnboarding) {
        state.setShowOnboarding(true);
        if (continuation?.intent === 'publish' && continuation.draftId === pageId) {
          state.setPendingPublishAfterOnboarding(true);
        }
      } else if (continuation?.intent === 'publish' && continuation.draftId === pageId) {
        pendingPublishHandled.current = true;
        clearAuthContinuation();
        handlePublish();
      }
    }
  }, [meData?.me, meLoading, pageId, handlePublish, router, state]);

  // Handle paste
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'TEXTAREA' || activeTag === 'INPUT') return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file && isAcceptedImageType(file.type)) {
            const result = await uploadAsset(file);
            if (result.success) {
              actions.handleAddBlock('IMAGE', 100, 100 + state.blocks.length * 30, result.data.url);
            }
          }
          return;
        }
      }

      const text = e.clipboardData?.getData('text/plain')?.trim();
      if (text) {
        e.preventDefault();
        const urlPattern = /^(https?:\/\/|www\.)[^\s]+$/i;
        if (urlPattern.test(text)) {
          let url = text;
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
          }
          if (isImageUrl(url)) {
            actions.handleAddBlock('IMAGE', 100, 100 + state.blocks.length * 30, url);
          } else {
            actions.handleAddBlock('LINK', 100, 100 + state.blocks.length * 30, url);
          }
        } else {
          actions.handleAddBlock('TEXT', 100, 100 + state.blocks.length * 30, text);
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [state.blocks.length, actions]);

  // Background panel handler
  const handleBackgroundChange = (newBackground: BackgroundConfig | undefined) => {
    history.saveToHistory();
    state.setBackground(newBackground);
  };

  const handleOpenBackgroundPanel = () => {
    if (!state.showBackgroundPanel) {
      history.saveToHistory();
    }
    state.setShowBackgroundPanel(!state.showBackgroundPanel);
  };

  const backgroundBrightness = getBackgroundBrightness(state.background);

  return (
    <div className={`${styles.editor} ${backgroundBrightness === 'dark' ? styles.darkBg : styles.lightBg}`}>
      {/* Top right controls */}
      <div className={styles.topRightControls}>
        <div className={styles.backgroundBtnWrapper}>
          <button
            className={`${styles.backgroundBtn} ${state.showBackgroundPanel ? styles.backgroundBtnActive : ''}`}
            onClick={handleOpenBackgroundPanel}
            data-background-btn
            title="Background"
          >
            <span className={styles.backgroundIcon} />
          </button>
          {state.showBackgroundPanel && (
            <BackgroundPanel
              background={state.background}
              onChange={handleBackgroundChange}
              onClose={() => state.setShowBackgroundPanel(false)}
            />
          )}
        </div>

        {/* Publish button with proper states */}
        {(() => {
          const hasUnpublishedChanges = state.isPublished &&
            state.publishedRevision !== null &&
            initialServerRevision > state.publishedRevision;

          if (state.publishing) {
            return <button className={styles.inviteBtn} disabled>Publishing…</button>;
          }

          if (state.publishError) {
            return (
              <button
                className={`${styles.inviteBtn} ${styles.publishError}`}
                onClick={() => { state.setPublishError(null); handlePublish(); }}
              >
                Retry publish
              </button>
            );
          }

          if (state.isPublished && !hasUnpublishedChanges) {
            return (
              <button className={`${styles.inviteBtn} ${styles.publishedBtn}`} onClick={handlePublish}>
                Published ✓
              </button>
            );
          }

          if (hasUnpublishedChanges) {
            return (
              <button className={`${styles.inviteBtn} ${styles.unpublishedChanges}`} onClick={handlePublish}>
                Update
              </button>
            );
          }

          return <button className={styles.inviteBtn} onClick={handlePublish}>Publish</button>;
        })()}
      </div>

      {/* Published URL indicator */}
      {state.isPublished && state.publishedUrl && (
        <div className={styles.publishedUrl}>
          <a href={state.publishedUrl} target="_blank" rel="noopener noreferrer">
            {state.publishedUrl.replace(/^https?:\/\//, '')}
          </a>
        </div>
      )}

      {/* Conflict resolution modal */}
      {state.showConflictModal && (
        <div className={styles.conflictModal}>
          <div className={styles.conflictContent}>
            <h3>Document changed</h3>
            <p>This space was modified elsewhere. What would you like to do?</p>
            <div className={styles.conflictActions}>
              <button
                onClick={() => {
                  state.setShowConflictModal(false);
                  // Simplified: just reload instead of complex conflict resolution
                  window.location.reload();
                }}
                className={styles.conflictBtn}
              >
                Load latest version
              </button>
            </div>
          </div>
        </div>
      )}

      <main className={styles.mainContent}>
        <Canvas
          blocks={state.blocks}
          background={state.background}
          selectedId={state.selectedId}
          selectedIds={state.selectedIds}
          newBlockIds={state.newBlockIds}
          editingId={state.editingId}
          starterMode={state.starterMode}
          onSelectBlock={state.setSelectedId}
          onSelectMultiple={state.setSelectedIds}
          onUpdateBlock={actions.handleUpdateBlock}
          onDeleteBlock={actions.handleDeleteBlock}
          onAddBlock={actions.handleAddBlock}
          onUpdateMultipleBlocks={actions.handleUpdateMultipleBlocks}
          onDragMultipleBlocks={actions.handleDragMultipleBlocks}
          onSetEditing={state.setEditingId}
          onExitStarterMode={actions.exitStarterMode}
          onInteractionStart={history.saveToHistory}
          onFirstInteraction={handleFirstInteraction}
          onBringForward={actions.handleBringForward}
          onSendBackward={actions.handleSendBackward}
          onBringToFront={actions.handleBringToFront}
          onSendToBack={actions.handleSendToBack}
        />
      </main>

      {/* Feedback button */}
      <button
        className={styles.feedbackBtn}
        onClick={() => state.setShowFeedbackModal(true)}
        title="Send feedback"
      >
        <svg className={styles.feedbackLogo} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        Send feedback
      </button>

      <AuthGate
        isOpen={state.showAuthGate}
        onClose={() => state.setShowAuthGate(false)}
        draftId={pageId}
        onAuthStart={() => {}}
      />

      <PublishToast
        isOpen={state.showPublishToast}
        url={state.publishedUrl}
        onClose={() => state.setShowPublishToast(false)}
      />

      <OnboardingModal
        isOpen={state.showOnboarding}
        userName={meData?.me?.name}
        onComplete={handleOnboardingComplete}
      />

      <ProductFeedbackModal
        isOpen={state.showFeedbackModal}
        onClose={() => state.setShowFeedbackModal(false)}
      />
    </div>
  );
}
