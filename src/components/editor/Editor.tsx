import { useEffect, useRef, useCallback } from 'react';
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

import { Canvas } from './Canvas';
import { BackgroundPanel } from './BackgroundPanel';
import { AuthGate } from './AuthGate';
import { PublishToast } from './PublishToast';
import { OnboardingModal } from './OnboardingModal';
import { ProductFeedbackModal } from '../viewer/ProductFeedbackModal';
import styles from './Editor.module.css';

import { isImageUrl, serializeLinkContent, getBackgroundBrightness } from '@/shared/utils/blockStyles';
import { useEditorState } from './useEditorState';
import { useEditorActions } from './useEditorActions';
import { useHistory } from './useHistory';
import { usePublish } from './usePublish';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

// Default starter background color - warm off-white/cream
const DEFAULT_STARTER_BACKGROUND: BackgroundConfig = {
  mode: 'solid',
  solid: { color: '#faf9f6' },
};

// Starter block ID prefix for identification
const STARTER_BLOCK_PREFIX = 'block_starter_';

/**
 * Creates the starter composition blocks for a new page.
 * These are examples to inspire - user can delete everything and start from zero.
 *
 * All positions use proportional values relative to the reference canvas (1200x800)
 * to ensure consistent layout across all screen sizes.
 */
function createStarterBlocks(): BlockType[] {
  const now = Date.now();
  const W = 1200;   // Reference width
  const H = 800;    // Reference height

  // Proportional positioning helpers
  const pX = (percent: number) => W * percent;
  const pY = (percent: number) => H * percent;
  const pW = (percent: number) => W * percent;
  const pH = (percent: number) => H * percent;

  return [
    // Large headline (centered) - the core message
    {
      id: `${STARTER_BLOCK_PREFIX}headline_${now}`,
      type: 'TEXT',
      x: pX(0.02),           // 2% from left (within safe zone)
      y: pY(0.12),           // 12% from top
      width: pW(0.50),       // 50% of canvas width
      height: pH(0.10),      // 10% of canvas height
      content: 'your corner of the internet',
      style: {
        borderRadius: 0,
        shadowStrength: 0,
        shadowSoftness: 0.5,
        shadowOffsetX: 0,
        shadowOffsetY: 0.2,
        fontSize: 48,
        fontWeight: 500,
        color: 'rgba(0, 0, 0, 0.85)',
        textAlign: 'center',
      },
      isStarter: true,
    },
    // Soft subtext underneath (lighter, smaller)
    {
      id: `${STARTER_BLOCK_PREFIX}subtext_${now}`,
      type: 'TEXT',
      x: pX(0.28),           // 42% from left (centered with ~17% width)
      y: pY(0.23),           // 25% from top
      width: pW(0.17),       // 17% of canvas width
      height: pH(0.045),     // 4.5% of canvas height
      content: 'a home on the web',
      style: {
        borderRadius: 0,
        shadowStrength: 0,
        shadowSoftness: 0.5,
        shadowOffsetX: 0,
        shadowOffsetY: 0.2,
        fontSize: 18,
        fontWeight: 400,
        color: 'rgba(0, 0, 0, 0.35)',
        textAlign: 'center',
      },
      isStarter: true,
    },
    // Song link on the upper left
    {
      id: `${STARTER_BLOCK_PREFIX}song_${now}`,
      type: 'LINK',
      x: pX(0.06),           // 6% from left
      y: pY(0.38),           // 40% from top
      width: pW(0.23),       // 23% of canvas width
      height: pH(0.04),      // 4% of canvas height
      content: serializeLinkContent('a song you always come back to', 'https://open.spotify.com'),
      style: {
        borderRadius: 0,
        shadowStrength: 0,
        shadowSoftness: 0.5,
        shadowOffsetX: 0,
        shadowOffsetY: 0.2,
        fontSize: 15,
        fontWeight: 400,
        color: 'rgba(0, 0, 0, 0.5)',
      },
      isStarter: true,
    },
    // Multi-line paragraph on the left
    {
      id: `${STARTER_BLOCK_PREFIX}paragraph_${now}`,
      type: 'TEXT',
      x: pX(0.06),           // 6% from left
      y: pY(0.46),           // 50% from top
      width: pW(0.17),       // 17% of canvas width
      height: pH(0.10),      // 10% of canvas height
      content: 'full freedom and control. \na collection of the things you love, \ninternet gems, or \nwhatever you want!',
      style: {
        borderRadius: 0,
        shadowStrength: 0,
        shadowSoftness: 0.5,
        shadowOffsetX: 0,
        shadowOffsetY: 0.2,
        fontSize: 16,
        fontWeight: 500,
        color: 'rgb(77, 119, 157)',
        textAlign: 'left',
      },
      isStarter: true,
    },
    // Image on the right side - colorful flowers
    {
      id: `${STARTER_BLOCK_PREFIX}image_${now}`,
      type: 'IMAGE',
      x: pX(0.57),           // 57% from left
      y: pY(0.29),           // 39% from top
      width: pW(0.27),       // 37% of canvas width
      height: pH(0.33),      // 43% of canvas height
      content: '/hero-flowers.png',
      style: {
        borderRadius: 0.02,
        shadowStrength: 0,
        shadowSoftness: 0.5,
        shadowOffsetX: 0,
        shadowOffsetY: 0.2,
      },
      isStarter: true,
    },
    // Twitter link
    {
      id: `${STARTER_BLOCK_PREFIX}twitter_${now}`,
      type: 'LINK',
      x: pX(0.35),           // 35% from left
      y: pY(0.61),           // 71% from top
      width: pW(0.13),       // 13% of canvas width
      height: pH(0.04),      // 4% of canvas height
      content: serializeLinkContent('→ your twitter', 'https://twitter.com'),
      style: {
        borderRadius: 0,
        shadowStrength: 0,
        shadowSoftness: 0.5,
        shadowOffsetX: 0,
        shadowOffsetY: 0.2,
        fontSize: 15,
        fontWeight: 400,
        color: 'rgb(0, 0, 0)',
      },
      isStarter: true,
    },
    // Github link
    {
      id: `${STARTER_BLOCK_PREFIX}github_${now}`,
      type: 'LINK',
      x: pX(0.40),           // 40% from left
      y: pY(0.70),           // 80% from top
      width: pW(0.13),       // 13% of canvas width
      height: pH(0.04),      // 4% of canvas height
      content: serializeLinkContent('→ things you build', 'https://github.com'),
      style: {
        borderRadius: 0,
        shadowStrength: 0,
        shadowSoftness: 0.5,
        shadowOffsetX: 0,
        shadowOffsetY: 0.2,
        fontSize: 14,
        fontWeight: 400,
        color: 'rgb(0, 0, 0)',
      },
      isStarter: true,
    },
  ];
}

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
  });

  // Initialize save controller for server mode
  const handleServerSave = useCallback(async (localRevision: number, baseServerRevision: number) => {
    try {
      const result = await updatePage({
        variables: {
          id: pageId,
          input: {
            title: state.title || null,
            blocks: state.blocks.map(({ id, type, x, y, width, height, content, style, effects }) => ({
              id, type, x, y, width, height, content, style, effects,
            })),
            background: state.background,
            localRevision,
            baseServerRevision,
          },
        },
      });

      const data = result.data?.updatePage;
      if (!data) {
        return { success: false, error: { code: 'UNKNOWN', message: 'No response from server' } };
      }

      if (data.conflict) {
        return {
          success: false,
          error: { code: 'CONFLICT', message: 'Document was modified elsewhere', serverRevision: data.currentServerRevision },
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
        return { success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Document too large to save' } };
      }
      if (message.includes('Network') || message.includes('fetch')) {
        return { success: false, error: { code: 'NETWORK', message: 'Network error' } };
      }
      return { success: false, error: { code: 'UNKNOWN', message } };
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
  useEffect(() => {
    if (mode === 'draft') {
      setActiveDraftId(pageId);
      const draft = getDraft(pageId);
      if (draft) {
        state.setTitle(draft.title || '');
        state.setBlocks(draft.blocks || []);
        state.setBackground(draft.background ?? DEFAULT_STARTER_BACKGROUND);
      }
    }
  }, [mode, pageId, state]);

  // Check for pending publish toast on mount
  useEffect(() => {
    const toastData = getPublishToastData();
    if (toastData) {
      state.setPublishedUrl(toastData.url);
      state.setShowPublishToast(true);
      state.setIsPublished(true);
      clearPublishToastData();
    }
  }, [state]);

  // Add starter blocks for empty draft pages
  const starterBlockAdded = useRef(false);
  useEffect(() => {
    if (mode === 'draft' && state.blocks.length === 0 && !starterBlockAdded.current) {
      const draft = getDraft(pageId);
      if ((!draft || draft.blocks.length === 0) && !hasStarterBeenDismissed(pageId)) {
        starterBlockAdded.current = true;
        const starterBlocks = createStarterBlocks();
        state.setBlocks(starterBlocks);
        state.setStarterMode(true);
        const headlineBlock = starterBlocks[0];
        state.setSelectedId(headlineBlock.id);
        state.setEditingId(headlineBlock.id);
      }
    }
  }, [mode, pageId, state.blocks.length, state]);

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

          setPublishToastData(publicUrl);
          router.replace(routes.edit(newPageId));
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
        Share ideas
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
