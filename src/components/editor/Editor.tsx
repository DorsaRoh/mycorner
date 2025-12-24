import { useEffect, useRef, useCallback, useState, useLayoutEffect } from 'react';
import { useRouter } from 'next/router';
import type { Block as BlockType, BackgroundConfig } from '@/shared/types';
import { useSaveController } from '@/lib/hooks/useSaveController';
import { uploadAsset, isAcceptedImageType } from '@/lib/upload';
import {
  getDraft,
  clearDraft,
  saveEditorDraft,
  loadEditorDraft,
} from '@/lib/draft';
import { routes, isDraftId } from '@/lib/routes';
import {
  createStarterBlocks,
  HINT_BLOCK_ID,
  DEFAULT_STARTER_BACKGROUND,
  STARTER_BLOCK_PREFIX,
} from '@/lib/starter';
import { useViewportMode, VIEWPORT_BREAKPOINT } from '@/lib/canvas';
import { assertThemeVarsOnRoot } from '@/lib/themeVars';

import { Canvas } from './Canvas';
import { BackgroundPanel } from './BackgroundPanel';
import { AuthGate } from './AuthGate';
import { PublishToast } from './PublishToast';
import { OnboardingModal } from './OnboardingModal';
import { ProductFeedbackModal } from '../viewer/ProductFeedbackModal';
import styles from './Editor.module.css';

import { isImageUrl } from '@/shared/utils/blockStyles';
import { getUiMode, getUiTokenStyles } from '@/lib/platformUi';
import { useEditorState } from './useEditorState';
import { useEditorActions } from './useEditorActions';
import { useHistory } from './useHistory';
import { usePublish } from './usePublish';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

// =============================================================================
// Auth Hook (replaces Apollo useQuery)
// =============================================================================

interface MeData {
  me: {
    id: string;
    email?: string;
    name?: string;
    username?: string;
    avatarUrl?: string;
  } | null;
}

function useMe() {
  const [data, setData] = useState<MeData | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const response = await fetch('/api/me');
      const result = await response.json();
      setData({
        me: result.user ? {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          username: result.user.username,
          avatarUrl: result.user.avatarUrl,
        } : null,
      });
    } catch {
      setData({ me: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const refetch = useCallback(async () => {
    setLoading(true);
    await fetchMe();
    return { data };
  }, [fetchMe, data]);

  return { data, loading, refetch };
}

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

  // dev-only: assert theme vars exist on :root at mount
  // this helps verify the ssr injection is working
  const themeAsserted = useRef(false);
  useLayoutEffect(() => {
    if (!themeAsserted.current) {
      themeAsserted.current = true;
      assertThemeVarsOnRoot();
    }
  }, []);

  // Auth state (replaces Apollo useQuery)
  const { data: meData, loading: meLoading, refetch: refetchMe } = useMe();
  
  // Track authentication status for persistence gating
  const isAuthenticated = !!meData?.me;
  const prevAuthRef = useRef<boolean | null>(null);

  // Mini confetti animation state
  const [showConfetti, setShowConfetti] = useState(false);
  const prevIsPublished = useRef<boolean>(initialPublished);
  
  // Track "just published" state for button text (shows "Published!" for 5s, then "Update")
  const [justPublished, setJustPublished] = useState(false);

  // Initialize state with hooks
  const state = useEditorState(
    initialBlocks,
    initialTitle,
    initialBackground ?? DEFAULT_STARTER_BACKGROUND,
    initialPublished,
    initialPublishedRevision
  );

  // Trigger confetti and "Published!" state when publish succeeds
  useEffect(() => {
    if (state.isPublished && !prevIsPublished.current) {
      console.log('[Editor] 🎉 Publish succeeded! Triggering confetti...');
      setShowConfetti(true);
      setJustPublished(true);
      const confettiTimer = setTimeout(() => setShowConfetti(false), 1500);
      const publishedTimer = setTimeout(() => setJustPublished(false), 5000);
      return () => {
        clearTimeout(confettiTimer);
        clearTimeout(publishedTimer);
      };
    }
    prevIsPublished.current = state.isPublished;
  }, [state.isPublished]);

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
    onDuplicateBlocks: actions.handleDuplicateBlocks,
  });

  // Initialize save controller for server mode (uses REST instead of GraphQL)
  const handleServerSave = useCallback(async (localRevision: number, baseServerRevision: number) => {
    try {
      const response = await fetch('/api/save-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId,
          title: state.title || null,
          blocks: state.blocks.map(({ id, type, x, y, width, height, content, style, effects, rotation }) => ({
            id, type, x, y, width, height, content, style, effects, rotation,
          })),
          background: state.background,
          localRevision,
          baseServerRevision,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        return { success: false, error: { code: 'UNKNOWN' as const, message: data.error || 'Save failed' } };
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
        updatedAt: data.updatedAt,
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
    if (mode === 'draft' && !draftLoaded.current && !meLoading) {
      draftLoaded.current = true;
      
      // Load existing draft
      const draft = loadEditorDraft();
      if (draft) {
        state.setTitle(draft.title || '');
        state.setBlocks(draft.blocks || []);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pageId, meLoading]);

  // Check for pending publish intent on mount (from session storage)
  const toastChecked = useRef(false);
  useEffect(() => {
    if (toastChecked.current) return;
    toastChecked.current = true;
    // Publish intent is now stored in sessionStorage by usePublish hook
    // No toast data to check
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
      const draft = getDraft();
      if (!draft || !draft.doc || draft.doc.blocks.length === 0) {
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
      saveEditorDraft(state.blocks, state.title, 'default', state.background);
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [mode, state.title, state.blocks, state.background]);

  // Handle logout transition: clear editor and draft
  useEffect(() => {
    if (meLoading) return;
    
    // Track auth state changes
    if (prevAuthRef.current === null) {
      // First load - just record the state
      prevAuthRef.current = isAuthenticated;
      return;
    }
    
    // Detect logout (was authenticated, now not)
    if (prevAuthRef.current === true && isAuthenticated === false) {
      console.log('[Editor] User logged out - clearing editor and draft');
      
      // Clear draft from storage
      clearDraft();
      
      // Reset editor to clean slate
      state.setBlocks([]);
      state.setTitle('');
      state.setBackground(DEFAULT_STARTER_BACKGROUND);
      state.setSelectedId(null);
      state.setSelectedIds(new Set());
      state.setEditingId(null);
      state.setIsPublished(false);
      state.setPublishedRevision(null);
      
      // Reset starter mode
      starterBlockAdded.current = false;
      state.setStarterMode(false);
    }
    
    // Update previous auth state
    prevAuthRef.current = isAuthenticated;
  }, [isAuthenticated, meLoading, state]);

  // Handle onboarding completion - trigger publish which handles redirect
  const pendingPublishHandled = useRef(false);
  const authCheckCompleted = useRef(false);
  const handleOnboardingComplete = useCallback(async (_username: string) => {
    state.setShowOnboarding(false);
    state.setPendingPublishAfterOnboarding(false);
    pendingPublishHandled.current = true;
    
    try {
      // Refetch user data to get the new username
      await refetchMe();
      
      // Trigger publish - this will create page, publish it, and redirect
      await handlePublish();
    } catch (error) {
      console.error('[Onboarding] Failed to publish after onboarding:', error);
      // If publish fails, show error to user
      state.setPublishError(error instanceof Error ? error.message : 'Failed to publish your page');
    }
  }, [state, refetchMe, handlePublish]);

  // Check for pending publish after auth or show onboarding
  useEffect(() => {
    // Only run the auth check once per page load
    if (meLoading || authCheckCompleted.current || pendingPublishHandled.current) {
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const needsOnboarding = urlParams.get('onboarding') === 'true' || (meData?.me && !meData.me.username);
    const shouldPublish = urlParams.get('publish') === '1';

    // Clean up URL params
    if (urlParams.has('onboarding') || urlParams.has('error') || urlParams.has('publish')) {
      urlParams.delete('onboarding');
      urlParams.delete('error');
      urlParams.delete('publish');
      const newUrl = urlParams.toString()
        ? `${window.location.pathname}?${urlParams.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }

    if (meData?.me) {
      if (needsOnboarding) {
        console.log('[Editor] User needs onboarding, showing modal');
        state.setShowOnboarding(true);
        if (shouldPublish) {
          console.log('[Editor] Will publish after onboarding completes');
          state.setPendingPublishAfterOnboarding(true);
        }
        authCheckCompleted.current = true;
      } else if (shouldPublish) {
        // Auto-publish after auth redirect (works for both draft and server modes)
        console.log('[Editor] ?publish=1 detected after auth, auto-publishing...');
        pendingPublishHandled.current = true;
        authCheckCompleted.current = true;
        // Small delay to ensure session is fully established after OAuth redirect
        setTimeout(() => {
          handlePublish();
        }, 100);
      } else {
        // No action needed
        authCheckCompleted.current = true;
      }
    }
  }, [meData?.me, meLoading, handlePublish, state]);

  // Handle paste
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'TEXTAREA' || activeTag === 'INPUT') return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file && isAcceptedImageType(file.type)) {
            // Create block immediately with loading state for instant feedback
            const blockId = actions.handleAddBlock('IMAGE', 100, 100 + state.blocks.length * 30, '__loading__');
            
            // Upload in background, then update the block by ID
            uploadAsset(file).then(result => {
              if (result.success) {
                actions.handleUpdateBlock(blockId, { content: result.data.url });
              } else {
                console.error('Paste upload failed:', result.error);
                actions.handleDeleteBlock(blockId);
              }
            });
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

  // Compute UI mode and tokens based on current background
  const uiMode = getUiMode(state.background);
  const uiTokenStyles = getUiTokenStyles(state.background);
  
  // Map UI mode to CSS class (for any remaining legacy styles)
  const uiModeClass = uiMode === 'dark' ? styles.darkBg : uiMode === 'glass' ? styles.glassBg : styles.lightBg;

  return (
    <div 
      className={`${styles.editor} ${uiModeClass}`}
      style={uiTokenStyles}
    >
      {/* Mini confetti celebration */}
      {showConfetti && (
        <div className={styles.confettiContainer}>
          {[...Array(8)].map((_, i) => (
            <div key={i} className={styles.confetti} />
          ))}
        </div>
      )}

      {/* Top right controls */}
      <div className={styles.topRightControls}>
        <div className={styles.backgroundBtnWrapper}>
          <button
            className={`${styles.backgroundBtn} ${state.showBackgroundPanel ? styles.backgroundBtnActive : ''}`}
            onClick={handleOpenBackgroundPanel}
            data-background-btn
            title="Change background"
          >
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
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
                title={state.publishError}
              >
                Retry publish
              </button>
            );
          }

          if (state.isPublished && !hasUnpublishedChanges) {
            return (
              <button className={`${styles.inviteBtn} ${styles.publishedBtn}`} onClick={() => handlePublish()}>
                {justPublished ? 'Published!' : 'Update'}
              </button>
            );
          }

          if (hasUnpublishedChanges) {
            return (
              <button className={`${styles.inviteBtn} ${styles.unpublishedChanges}`} onClick={() => handlePublish()}>
                Update
              </button>
            );
          }

          return <button className={styles.inviteBtn} onClick={() => handlePublish()}>Publish</button>;
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
        returnTo={mode === 'draft' ? '/new?publish=1' : '/edit?publish=1'}
      />

      <PublishToast
        isOpen={state.showPublishToast}
        url={state.publishedUrl}
        onClose={() => state.setShowPublishToast(false)}
      />

      <OnboardingModal
        isOpen={state.showOnboarding}
        onComplete={handleOnboardingComplete}
      />

      <ProductFeedbackModal
        isOpen={state.showFeedbackModal}
        onClose={() => state.setShowFeedbackModal(false)}
      />
    </div>
  );
}
