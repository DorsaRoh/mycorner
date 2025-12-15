import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useMutation, useQuery, gql } from '@apollo/client';
import type { Block as BlockType, BackgroundConfig } from '@/shared/types';
import { DEFAULT_STYLE } from '@/shared/types';
import { UPDATE_PAGE, PUBLISH_PAGE, CREATE_PAGE } from '@/lib/graphql/mutations';
import { useSaveController, SaveResult } from '@/lib/hooks/useSaveController';
import { uploadAsset, isAcceptedImageType } from '@/lib/upload';
import {
  DraftData,
  getDraft,
  saveDraft,
  deleteDraft,
  setActiveDraftId,
  setAuthContinuation,
  getAuthContinuation,
  clearAuthContinuation,
  hasStarterBeenDismissed,
  setStarterDismissed,
  setPublishToastData,
  getPublishToastData,
  clearPublishToastData,
} from '@/lib/draft/storage';
import { routes, getPublicUrl, isDraftId } from '@/lib/routes';

// Helper to recursively strip __typename from objects (Apollo Client adds these for caching)
function stripTypename<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(stripTypename) as T;
  }
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
import { Canvas } from './Canvas';
import { BackgroundPanel } from './BackgroundPanel';
import { AuthGate } from './AuthGate';
import { PublishToast } from './PublishToast';
import { OnboardingModal } from './OnboardingModal';
import styles from './Editor.module.css';

import { isImageUrl, serializeLinkContent, getBackgroundBrightness } from '@/shared/utils/blockStyles';
import { REFERENCE_WIDTH, REFERENCE_HEIGHT, clampToSafeZone } from '@/lib/canvas';

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
  const W = REFERENCE_WIDTH;   // 1200
  const H = REFERENCE_HEIGHT;  // 800
  
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
        ...DEFAULT_STYLE,
        fontSize: 48,
        fontWeight: 500,
        color: 'rgba(0, 0, 0, 0.85)',
        textAlign: 'center',
      },
      isStarter: true,
      starterOwned: false,
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
        ...DEFAULT_STYLE,
        fontSize: 18,
        fontWeight: 400,
        color: 'rgba(0, 0, 0, 0.35)',
        textAlign: 'center',
      },
      isStarter: true,
      starterOwned: false,
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
        ...DEFAULT_STYLE,
        fontSize: 15,
        fontWeight: 400,
        color: 'rgba(0, 0, 0, 0.5)',
      },
      isStarter: true,
      starterOwned: false,
    },
    // Multi-line paragraph on the left
    {
      id: `${STARTER_BLOCK_PREFIX}paragraph_${now}`,
      type: 'TEXT',
      x: pX(0.06),           // 6% from left
      y: pY(0.46),           // 50% from top
      width: pW(0.17),       // 17% of canvas width
      height: pH(0.10),      // 10% of canvas height
      content: 'a collection of the things you love, \n internet gems, or \nwhatever you want!',
      style: {
        ...DEFAULT_STYLE,
        fontSize: 16,
        fontWeight: 500,
        color: 'rgb(77, 119, 157)',
        textAlign: 'left',
      },
      isStarter: true,
      starterOwned: false,
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
        ...DEFAULT_STYLE,
        borderRadius: 0.02,
      },
      isStarter: true,
      starterOwned: false,
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
        ...DEFAULT_STYLE,
        fontSize: 15,
        fontWeight: 400,
        color: 'rgb(0, 0, 0)',
      },
      isStarter: true,
      starterOwned: false,
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
        ...DEFAULT_STYLE,
        fontSize: 14,
        fontWeight: 400,
        color: 'rgb(0, 0, 0)',
      },
      isStarter: true,
      starterOwned: false,
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

// Default starter background color - warm off-white/cream
const DEFAULT_STARTER_BACKGROUND: BackgroundConfig = {
  mode: 'solid',
  solid: { color: '#faf9f6' },
};

// Undo history types
interface HistoryState {
  blocks: BlockType[];
  background: BackgroundConfig | undefined;
}

const MAX_HISTORY_SIZE = 50;

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
  const [blocks, setBlocks] = useState<BlockType[]>(initialBlocks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [background, setBackground] = useState<BackgroundConfig | undefined>(initialBackground ?? DEFAULT_STARTER_BACKGROUND);
  const [isPublished, setIsPublished] = useState(initialPublished);
  const [publishedRevision, setPublishedRevision] = useState<number | null>(initialPublishedRevision);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [showBackgroundPanel, setShowBackgroundPanel] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [newBlockIds, setNewBlockIds] = useState<Set<string>>(new Set());
  const [starterMode, setStarterMode] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [showPublishToast, setShowPublishToast] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [pendingPublishAfterOnboarding, setPendingPublishAfterOnboarding] = useState(false);
  
  // Undo/redo history
  const [undoStack, setUndoStack] = useState<HistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryState[]>([]);
  const isUndoRedoAction = useRef(false);
  
  // Refs
  const blocksRef = useRef(blocks);
  const titleRef = useRef(title);
  const backgroundRef = useRef(background);
  const starterBlockAdded = useRef(false);
  const isFirstRender = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingPublishHandled = useRef(false);
  
  // Keep refs in sync
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);
  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { backgroundRef.current = background; }, [background]);

  // Save current state to undo history before making changes
  const saveToHistory = useCallback(() => {
    if (isUndoRedoAction.current) return;
    
    const currentState: HistoryState = {
      blocks: JSON.parse(JSON.stringify(blocksRef.current)),
      background: backgroundRef.current ? JSON.parse(JSON.stringify(backgroundRef.current)) : undefined,
    };
    
    setUndoStack(prev => {
      const newStack = [...prev, currentState];
      // Limit history size
      if (newStack.length > MAX_HISTORY_SIZE) {
        return newStack.slice(-MAX_HISTORY_SIZE);
      }
      return newStack;
    });
    
    // Clear redo stack when new action is performed
    setRedoStack([]);
  }, []);

  // Undo action
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    
    // Save current state to redo stack
    const currentState: HistoryState = {
      blocks: JSON.parse(JSON.stringify(blocksRef.current)),
      background: backgroundRef.current ? JSON.parse(JSON.stringify(backgroundRef.current)) : undefined,
    };
    setRedoStack(prev => [...prev, currentState]);
    
    // Pop from undo stack and restore
    const previousState = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    
    // Mark this as an undo/redo action to prevent saving to history
    isUndoRedoAction.current = true;
    setBlocks(previousState.blocks);
    setBackground(previousState.background);
    
    // Clear selection since restored blocks might not exist
    setSelectedId(null);
    setSelectedIds(new Set());
    setEditingId(null);
    
    // Reset flag after state updates
    requestAnimationFrame(() => {
      isUndoRedoAction.current = false;
    });
  }, [undoStack]);

  // Redo action
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    
    // Save current state to undo stack
    const currentState: HistoryState = {
      blocks: JSON.parse(JSON.stringify(blocksRef.current)),
      background: backgroundRef.current ? JSON.parse(JSON.stringify(backgroundRef.current)) : undefined,
    };
    setUndoStack(prev => [...prev, currentState]);
    
    // Pop from redo stack and restore
    const nextState = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    
    // Mark this as an undo/redo action to prevent saving to history
    isUndoRedoAction.current = true;
    setBlocks(nextState.blocks);
    setBackground(nextState.background);
    
    // Clear selection
    setSelectedId(null);
    setSelectedIds(new Set());
    setEditingId(null);
    
    // Reset flag after state updates
    requestAnimationFrame(() => {
      isUndoRedoAction.current = false;
    });
  }, [redoStack]);

  // Background change handler (history is saved when panel opens, not on each change)
  const handleBackgroundChange = useCallback((newBackground: BackgroundConfig | undefined) => {
    setBackground(newBackground);
  }, []);

  // Open background panel and save history before changes
  const handleOpenBackgroundPanel = useCallback(() => {
    if (!showBackgroundPanel) {
      saveToHistory();
    }
    setShowBackgroundPanel(!showBackgroundPanel);
  }, [showBackgroundPanel, saveToHistory]);

  // Queries and mutations
  const { data: meData, loading: meLoading, refetch: refetchMe } = useQuery(ME_QUERY);
  const [createPage] = useMutation(CREATE_PAGE, { errorPolicy: 'all' });
  const [updatePage] = useMutation(UPDATE_PAGE, { errorPolicy: 'all' });
  const [publishPage] = useMutation(PUBLISH_PAGE, { errorPolicy: 'all' });

  // Initialize draft from localStorage for draft mode
  useEffect(() => {
    if (mode === 'draft') {
      setActiveDraftId(pageId);
      const draft = getDraft(pageId);
      if (draft) {
        setTitle(draft.title || '');
        setBlocks(draft.blocks || []);
        setBackground(draft.background ?? DEFAULT_STARTER_BACKGROUND);
      }
    }
  }, [mode, pageId]);

  // Check for pending publish toast on mount (after navigation from draft publish)
  useEffect(() => {
    const toastData = getPublishToastData();
    if (toastData) {
      setPublishedUrl(toastData.url);
      setShowPublishToast(true);
      setIsPublished(true);
      clearPublishToastData();
    }
  }, []);

  // Add starter blocks for empty draft pages
  useEffect(() => {
    if (mode === 'draft' && blocks.length === 0 && !starterBlockAdded.current) {
      const draft = getDraft(pageId);
      if ((!draft || draft.blocks.length === 0) && !hasStarterBeenDismissed(pageId)) {
        starterBlockAdded.current = true;
        const starterBlocks = createStarterBlocks();
        setBlocks(starterBlocks);
        setStarterMode(true);
        const headlineBlock = starterBlocks[0];
        setSelectedId(headlineBlock.id);
        setEditingId(headlineBlock.id);
      }
    }
  }, [mode, pageId, blocks.length]);

  // Server mode: save callback for useSaveController
  const handleServerSave = useCallback(async (localRevision: number, baseServerRevision: number): Promise<SaveResult> => {
    try {
      const result = await updatePage({
        variables: {
          id: pageId,
          input: {
            title: titleRef.current || null,
            blocks: blocksRef.current.map(({ id, type, x, y, width, height, content, style, effects }) => ({
              id, type, x, y, width, height, content,
              style: stripTypename(style),
              effects: stripTypename(effects),
            })),
            background: stripTypename(backgroundRef.current),
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
  }, [pageId, updatePage]);

  // Stable conflict handler to avoid dependency issues
  const handleConflict = useCallback(() => {
    setShowConflictModal(true);
  }, []);

  // Initialize save controller for server mode
  const {
    saveState,
    isOffline,
    markDirty,
    saveNow,
    retry,
    serverRevision,
    getServerRevision,
  } = useSaveController({
    debounceMs: 1000,
    onSave: handleServerSave,
    initialServerRevision,
    onConflict: handleConflict,
    debug: false, // Disable debug logging to reduce console noise
    enabled: mode === 'server',
  });

  // Mark dirty for server mode
  useEffect(() => {
    if (mode === 'server') {
      if (isFirstRender.current) {
        isFirstRender.current = false;
        return;
      }
      markDirty();
    }
  }, [mode, blocks, title, background, markDirty]);

  // Auto-save to localStorage for draft mode
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
      const draft: DraftData = {
        id: pageId,
        title,
        blocks,
        background,
        createdAt: getDraft(pageId)?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      saveDraft(draft);
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [mode, pageId, title, blocks, background]);

  /**
   * Force save the current draft to localStorage immediately.
   * This ensures the draft is persisted before navigating away (e.g., for auth).
   */
  const forceSaveDraft = useCallback(() => {
    if (mode !== 'draft') return;
    
    // Clear any pending debounced save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    
    // Save immediately
    const draft: DraftData = {
      id: pageId,
      title: titleRef.current,
      blocks: blocksRef.current,
      background: backgroundRef.current,
      createdAt: getDraft(pageId)?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    saveDraft(draft);
  }, [mode, pageId]);

  // Handle publish - unified for both modes
  // Key change: We pass content directly in the publish request to ensure
  // the published version exactly matches what the user sees in the editor.
  const handlePublish = useCallback(async () => {
    // Check if user is authenticated - try refetch, fall back to cached data
    let isAuthenticated = false;
    try {
      const { data: freshMe } = await refetchMe();
      isAuthenticated = !!freshMe?.me;
    } catch (error) {
      // Refetch failed (network error, etc.) - fall back to cached meData
      console.warn('Auth check refetch failed, using cached data:', error);
      isAuthenticated = !!meData?.me;
    }
    
    if (!isAuthenticated) {
      // Force save draft before auth redirect to ensure content is persisted
      forceSaveDraft();
      
      // Store auth continuation with intent to publish
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

      // Get current content from refs (always use the latest editor state)
      const blocksToPublish = blocksRef.current;
      const titleToPublish = titleRef.current || '';
      const backgroundToPublish = backgroundRef.current;

      if (mode === 'draft' || isDraftId(pageId)) {
        // Draft mode: create page on server first, then publish with content
        const draft = getDraft(pageId);
        const finalBlocks = blocksToPublish.length > 0 ? blocksToPublish : (draft?.blocks || []);
        const finalTitle = titleToPublish || draft?.title || '';
        const finalBackground = backgroundToPublish ?? draft?.background;
        
        // Create page
        const createResult = await createPage({
          variables: { input: { title: finalTitle || undefined } },
        });

        if (createResult.errors?.length) {
          throw new Error(createResult.errors[0].message || 'Failed to create page');
        }
        if (!createResult.data?.createPage?.id) {
          throw new Error('Failed to create page');
        }

        serverPageId = createResult.data.createPage.id;
        currentServerRevision = 1; // New page starts at revision 1

        // For draft mode, we need to save content first to get a valid server revision
        const updateResult = await updatePage({
          variables: {
            id: serverPageId,
            input: {
              title: finalTitle || undefined,
              blocks: finalBlocks.map(({ id, type, x, y, width, height, content, style, effects }) => ({
                id, type, x, y, width, height, content,
                style: stripTypename(style),
                effects: stripTypename(effects),
              })),
              background: stripTypename(finalBackground),
              baseServerRevision: 1,
            },
          },
        });

        if (updateResult.errors?.length) {
          throw new Error(updateResult.errors[0].message || 'Failed to save page');
        }
        
        // Get the new server revision after update
        currentServerRevision = updateResult.data?.updatePage?.currentServerRevision ?? 2;

        // Now publish with the exact content we just saved
        const publishResult = await publishPage({
          variables: { 
            id: serverPageId,
            input: {
              blocks: finalBlocks.map(({ id, type, x, y, width, height, content, style, effects }) => ({
                id, type, x, y, width, height, content,
                style: stripTypename(style),
                effects: stripTypename(effects),
              })),
              background: stripTypename(finalBackground),
              baseServerRevision: currentServerRevision,
            },
          },
        });

        if (publishResult.errors?.length) {
          throw new Error(publishResult.errors[0].message || 'Failed to publish page');
        }

        const publishData = publishResult.data?.publishPage;
        if (publishData?.conflict) {
          throw new Error('Content changed during publish. Please try again.');
        }

        if (publishData?.page) {
          setIsPublished(true);
          setPublishedRevision(publishData.publishedRevision);
          
          // Clear draft
          deleteDraft(pageId);
          clearAuthContinuation();

          // Use the public URL from the server response
          const publicUrl = publishData.publicUrl 
            ? `${window.location.origin}${publishData.publicUrl}`
            : getPublicUrl(serverPageId);
          
          // Store toast data before navigation so it persists across page load
          setPublishToastData(publicUrl);

          // Navigate to the server page URL
          router.replace(routes.edit(serverPageId));
        } else {
          throw new Error('Failed to publish page');
        }
      } else {
        // Server mode: flush pending saves first, then publish with current content
        // saveNow() returns the latest server revision directly
        currentServerRevision = await saveNow();

        // Publish with the exact content currently in the editor
        const publishResult = await publishPage({
          variables: { 
            id: serverPageId,
            input: {
              blocks: blocksToPublish.map(({ id, type, x, y, width, height, content, style, effects }) => ({
                id, type, x, y, width, height, content,
                style: stripTypename(style),
                effects: stripTypename(effects),
              })),
              background: stripTypename(backgroundToPublish),
              baseServerRevision: currentServerRevision,
            },
          },
        });

        if (publishResult.errors?.length) {
          throw new Error(publishResult.errors[0].message || 'Failed to publish page');
        }

        const publishData = publishResult.data?.publishPage;
        
        if (publishData?.conflict) {
          // Conflict detected - server had newer content
          // This shouldn't happen after saveNow(), but handle it gracefully
          setPublishError('Content was modified. Please try again.');
          return;
        }

        if (publishData?.page) {
          setIsPublished(true);
          setPublishedRevision(publishData.publishedRevision);

          // Get username for URL
          let username: string | undefined;
          try {
            const { data: freshMeData } = await refetchMe();
            username = freshMeData?.me?.username;
          } catch {
            username = meData?.me?.username;
          }

          // Use the public URL from the server response, or construct one
          const publicUrl = publishData.publicUrl 
            ? `${window.location.origin}${publishData.publicUrl}`
            : getPublicUrl(serverPageId, username);
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
  }, [mode, pageId, meData?.me, refetchMe, createPage, updatePage, publishPage, saveNow, router, forceSaveDraft, initialServerRevision]);

  // Check for pending publish after auth or show onboarding
  useEffect(() => {
    if (meLoading || pendingPublishHandled.current) return;
    
    // Check if user needs onboarding (URL has ?onboarding=true or user has no username)
    const urlParams = new URLSearchParams(window.location.search);
    const needsOnboarding = urlParams.get('onboarding') === 'true' || (meData?.me && !meData.me.username);
    
    // Clean up URL params if present
    if (urlParams.has('onboarding') || urlParams.has('error')) {
      urlParams.delete('onboarding');
      urlParams.delete('error');
      const newUrl = urlParams.toString() 
        ? `${window.location.pathname}?${urlParams.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
    
    // Get auth continuation
    const continuation = getAuthContinuation();
    
    // Handle authenticated user returning from OAuth
    if (meData?.me) {
      // Check if we need to navigate to the correct draft first
      if (continuation && continuation.draftId !== pageId) {
        // User landed on wrong page - navigate to the continuation's page
        router.replace(`/edit/${continuation.draftId}`);
        return;
      }
      
      if (needsOnboarding) {
        setShowOnboarding(true);
        // If there's a pending publish, mark it for after onboarding
        if (continuation?.intent === 'publish' && continuation.draftId === pageId) {
          setPendingPublishAfterOnboarding(true);
        }
      } else if (continuation?.intent === 'publish' && continuation.draftId === pageId) {
        // User is authenticated, onboarded, and has pending publish - execute it
        pendingPublishHandled.current = true;
        clearAuthContinuation();
        handlePublish();
      }
    }
  }, [meData?.me, meLoading, pageId, handlePublish, router]);

  // Handle onboarding completion
  const handleOnboardingComplete = useCallback(async (username: string, pageTitle: string, newPageId: string) => {
    setShowOnboarding(false);
    await refetchMe();
    
    if (pendingPublishAfterOnboarding) {
      setPendingPublishAfterOnboarding(false);
      pendingPublishHandled.current = true;
      clearAuthContinuation();
      
      // Get the draft content that was being edited
      const draft = getDraft(pageId);
      const blocksToPublish = draft?.blocks || blocksRef.current;
      const backgroundToPublish = draft?.background || backgroundRef.current;
      const titleToPublish = draft?.title || titleRef.current || pageTitle;
      
      setPublishing(true);
      setPublishError(null);
      
      try {
        // Update the onboarding-created page with our draft content
        const updateResult = await updatePage({
          variables: {
            id: newPageId,
            input: {
              title: titleToPublish || undefined,
              blocks: blocksToPublish.map(({ id, type, x, y, width, height, content, style, effects }) => ({
                id, type, x, y, width, height, content,
                style: stripTypename(style),
                effects: stripTypename(effects),
              })),
              background: stripTypename(backgroundToPublish),
              baseServerRevision: 1, // New page starts at revision 1
            },
          },
        });
        
        // Get the new server revision
        const newServerRevision = updateResult.data?.updatePage?.currentServerRevision ?? 2;
        
        // Publish the page with content snapshot
        const { data: publishData } = await publishPage({
          variables: { 
            id: newPageId,
            input: {
              blocks: blocksToPublish.map(({ id, type, x, y, width, height, content, style, effects }) => ({
                id, type, x, y, width, height, content,
                style: stripTypename(style),
                effects: stripTypename(effects),
              })),
              background: stripTypename(backgroundToPublish),
              baseServerRevision: newServerRevision,
            },
          },
        });
        
        if (publishData?.publishPage?.page) {
          setIsPublished(true);
          setPublishedRevision(publishData.publishPage.publishedRevision);
          
          // Clean up the draft
          deleteDraft(pageId);
          
          // Use the public URL from the response
          const publicUrl = publishData.publishPage.publicUrl 
            ? `${window.location.origin}${publishData.publishPage.publicUrl}`
            : getPublicUrl(newPageId, username);
          
          // Store toast data before navigation so it persists across page load
          setPublishToastData(publicUrl);
          
          // Navigate to the published page's edit URL
          router.replace(routes.edit(newPageId));
        } else if (publishData?.publishPage?.conflict) {
          throw new Error('Content conflict during publish');
        } else {
          throw new Error('Failed to publish page');
        }
      } catch (error) {
        console.error('Publish after onboarding failed:', error);
        setPublishing(false);
        setPublishError(error instanceof Error ? error.message : 'Publish failed');
        // Navigate to the new page anyway so user can retry
        router.push(routes.edit(newPageId));
      }
    } else {
      // No pending publish - just navigate to the new page created during onboarding
      router.push(routes.edit(newPageId));
    }
  }, [pendingPublishAfterOnboarding, pageId, updatePage, publishPage, router, refetchMe]);

  const generateBlockId = useCallback(() => {
    return `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }, []);

  // Exit starter mode
  const exitStarterMode = useCallback(() => {
    if (starterMode) {
      setStarterMode(false);
      setStarterDismissed(pageId);
      setBlocks((prev) => prev.filter((b) => {
        if (!b.isStarter) return true;
        return b.starterOwned === true;
      }));
      setSelectedId(null);
      setEditingId(null);
    }
  }, [starterMode, pageId]);

  const handleAddBlock = useCallback((type: BlockType['type'], x?: number, y?: number, content?: string) => {
    saveToHistory();
    exitStarterMode();
    
    const newId = generateBlockId();
    let width = 200;
    let height = 100;
    let fontSize: number | undefined;

    if (type === 'TEXT') {
      width = 300;
      height = 80;
      fontSize = 60;
    } else if (type === 'LINK') {
      width = 200;
      height = 60;
      fontSize = 40;
    } else if (type === 'IMAGE') {
      width = 320;
      height = 240;
    }

    // Get the target position and clamp to safe zone
    const targetX = x ?? 100;
    const targetY = y ?? 100 + blocks.length * 20;
    const { x: safeX, y: safeY } = clampToSafeZone(targetX, targetY, width, height);
    
    // Always include style to ensure consistent behavior with starter blocks
    const newBlock: BlockType = {
      id: newId,
      type,
      x: safeX,
      y: safeY,
      width,
      height,
      content: content ?? '',
      style: { ...DEFAULT_STYLE, ...(fontSize ? { fontSize } : {}) },
    };

    setNewBlockIds(prev => new Set(prev).add(newId));
    setTimeout(() => {
      setNewBlockIds(prev => {
        const next = new Set(prev);
        next.delete(newId);
        return next;
      });
    }, 200);

    setBlocks((prev) => [...prev, newBlock]);
    setSelectedId(newBlock.id);

    if (type === 'TEXT' || type === 'LINK') {
      setEditingId(newId);
    }
  }, [blocks.length, generateBlockId, exitStarterMode, saveToHistory]);

  const handleUpdateBlock = useCallback((id: string, updates: Partial<BlockType>) => {
    setBlocks((prev) =>
      prev.map((block) => {
        if (block.id !== id) return block;
        
        if (block.isStarter && !block.starterOwned) {
          const isContentChange = 'content' in updates && updates.content !== block.content;
          const isPositionChange = ('x' in updates && updates.x !== block.x) || 
                                   ('y' in updates && updates.y !== block.y);
          const isSizeChange = ('width' in updates && updates.width !== block.width) ||
                               ('height' in updates && updates.height !== block.height);
          const isStyleChange = 'style' in updates;
          
          if (isContentChange || isPositionChange || isSizeChange || isStyleChange) {
            const newBlock = { ...block, ...updates, starterOwned: true };
            
            if (isContentChange && (block.type === 'TEXT' || block.type === 'LINK')) {
              newBlock.style = { ...DEFAULT_STYLE, ...block.style, color: 'rgba(0, 0, 0, 0.85)' };
            }
            
            return newBlock;
          }
        }
        
        return { ...block, ...updates };
      })
    );
  }, []);

  const handleUpdateMultipleBlocks = useCallback((ids: Set<string>, updates: Partial<BlockType>) => {
    setBlocks((prev) =>
      prev.map((block) =>
        ids.has(block.id) ? { ...block, ...updates } : block
      )
    );
  }, []);

  const handleDragMultipleBlocks = useCallback((ids: Set<string>, dx: number, dy: number) => {
    setBlocks((prev) =>
      prev.map((block) => {
        if (ids.has(block.id)) {
          const rawX = block.x + dx;
          const rawY = block.y + dy;
          // Clamp to safe zone (respecting side margins)
          const { x: newX, y: newY } = clampToSafeZone(rawX, rawY, block.width, block.height);
          return { ...block, x: newX, y: newY };
        }
        return block;
      })
    );
  }, []);

  const handleDeleteBlock = useCallback((id: string) => {
    saveToHistory();
    const blockToDelete = blocks.find(b => b.id === id);
    if (blockToDelete?.isStarter && starterMode) {
      setStarterMode(false);
      setStarterDismissed(pageId);
      setBlocks((prev) => prev.filter((b) => {
        if (b.id === id) return false;
        if (!b.isStarter) return true;
        return b.starterOwned === true;
      }));
      if (selectedId === id) setSelectedId(null);
      setSelectedIds(new Set());
      return;
    }
    
    setBlocks((prev) => prev.filter((block) => block.id !== id));
    if (selectedId === id) setSelectedId(null);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [selectedId, blocks, starterMode, pageId, saveToHistory]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size > 0) {
      setBlocks((prev) => prev.filter((block) => !selectedIds.has(block.id)));
      setSelectedIds(new Set());
      setSelectedId(null);
    } else if (selectedId) {
      handleDeleteBlock(selectedId);
    }
  }, [selectedId, selectedIds, handleDeleteBlock]);

  const handleSelectBlock = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id !== null) setSelectedIds(new Set());
  }, []);

  const handleSelectMultiple = useCallback((ids: Set<string>) => {
    setSelectedIds(ids);
    if (ids.size === 1) {
      const [singleId] = ids;
      setSelectedId(singleId);
    } else if (ids.size > 1) {
      setSelectedId(null);
    }
  }, []);

  const handleSetEditing = useCallback((id: string | null) => {
    setEditingId(id);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      const isInputFocused = activeTag === 'TEXTAREA' || activeTag === 'INPUT';

      // Undo: Ctrl+Z / Cmd+Z
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && !isInputFocused) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y / Cmd+Y
      if ((e.metaKey || e.ctrlKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y') && !isInputFocused) {
        e.preventDefault();
        handleRedo();
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputFocused && !editingId) {
        if (selectedIds.size > 0 || selectedId) {
          e.preventDefault();
          handleDeleteSelected();
        }
      }

      if (e.key === 'Escape') {
        if (editingId) {
          setEditingId(null);
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        } else {
          setSelectedId(null);
          setSelectedIds(new Set());
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && !isInputFocused) {
        e.preventDefault();
        setSelectedIds(new Set(blocks.map(b => b.id)));
        setSelectedId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, selectedIds, blocks, editingId, handleDeleteSelected, handleUndo, handleRedo]);

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
              handleAddBlock('IMAGE', 100, 100 + blocks.length * 30, result.data.url);
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
            handleAddBlock('IMAGE', 100, 100 + blocks.length * 30, url);
          } else {
            handleAddBlock('LINK', 100, 100 + blocks.length * 30, url);
          }
        } else {
          handleAddBlock('TEXT', 100, 100 + blocks.length * 30, text);
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [blocks.length, handleAddBlock]);

  const backgroundBrightness = getBackgroundBrightness(background);

  return (
    <div className={`${styles.editor} ${backgroundBrightness === 'dark' ? styles.darkBg : styles.lightBg}`}>
      {/* Top right controls */}
      <div className={styles.topRightControls}>
        <div className={styles.backgroundBtnWrapper}>
          <button
            className={`${styles.backgroundBtn} ${showBackgroundPanel ? styles.backgroundBtnActive : ''}`}
            onClick={handleOpenBackgroundPanel}
            data-background-btn
            title="Background"
          >
            <span className={styles.backgroundIcon} />
          </button>
          {showBackgroundPanel && (
            <BackgroundPanel
              background={background}
              onChange={handleBackgroundChange}
              onClose={() => setShowBackgroundPanel(false)}
            />
          )}
        </div>
        {/* Publish button with proper states */}
        {(() => {
          // Determine publish button state:
          // - publishing: show "Publishing..."
          // - error: show error with retry option
          // - isPublished && no changes since publish: show "Published ✓"
          // - isPublished && changes since publish: show "Update" (unpublished changes)
          // - not published: show "Publish"
          
          const hasUnpublishedChanges = isPublished && 
            publishedRevision !== null && 
            serverRevision > publishedRevision;
          
          if (publishing) {
            return (
              <button className={styles.inviteBtn} disabled>
                Publishing…
              </button>
            );
          }
          
          if (publishError) {
            return (
              <button 
                className={`${styles.inviteBtn} ${styles.publishError}`}
                onClick={() => { setPublishError(null); handlePublish(); }}
              >
                Retry publish
              </button>
            );
          }
          
          if (isPublished && !hasUnpublishedChanges) {
            return (
              <button 
                className={`${styles.inviteBtn} ${styles.publishedBtn}`}
                onClick={handlePublish}
              >
                Published ✓
              </button>
            );
          }
          
          if (hasUnpublishedChanges) {
            return (
              <button 
                className={`${styles.inviteBtn} ${styles.unpublishedChanges}`}
                onClick={handlePublish}
              >
                Update
              </button>
            );
          }
          
          return (
            <button className={styles.inviteBtn} onClick={handlePublish}>
              Publish
            </button>
          );
        })()}
      </div>

      {/* Published URL indicator (minimal) */}
      {isPublished && publishedUrl && (
        <div className={styles.publishedUrl}>
          <a href={publishedUrl} target="_blank" rel="noopener noreferrer">
            {publishedUrl.replace(/^https?:\/\//, '')}
          </a>
        </div>
      )}

      
      {/* Conflict resolution modal */}
      {showConflictModal && (
        <div className={styles.conflictModal}>
          <div className={styles.conflictContent}>
            <h3>Document changed</h3>
            <p>This space was modified elsewhere. What would you like to do?</p>
            <div className={styles.conflictActions}>
              <button
                onClick={() => {
                  setShowConflictModal(false);
                  retry();
                }}
                className={styles.conflictBtn}
              >
                Keep my changes
              </button>
              <button
                onClick={() => {
                  setShowConflictModal(false);
                  window.location.reload();
                }}
                className={styles.conflictBtnSecondary}
              >
                Load latest version
              </button>
            </div>
          </div>
        </div>
      )}

      <main className={styles.mainContent}>
        <Canvas
          blocks={blocks}
          background={background}
          selectedId={selectedId}
          selectedIds={selectedIds}
          newBlockIds={newBlockIds}
          editingId={editingId}
          starterMode={starterMode}
          onSelectBlock={handleSelectBlock}
          onSelectMultiple={handleSelectMultiple}
          onUpdateBlock={handleUpdateBlock}
          onDeleteBlock={handleDeleteBlock}
          onAddBlock={handleAddBlock}
          onUpdateMultipleBlocks={handleUpdateMultipleBlocks}
          onDragMultipleBlocks={handleDragMultipleBlocks}
          onSetEditing={handleSetEditing}
          onExitStarterMode={exitStarterMode}
          onInteractionStart={saveToHistory}
        />
      </main>

      <AuthGate
        isOpen={showAuthGate}
        onClose={() => setShowAuthGate(false)}
        draftId={pageId}
        onAuthStart={() => {
          // Auth continuation is already set, auth will handle return
        }}
      />

      <PublishToast
        isOpen={showPublishToast}
        url={publishedUrl}
        onClose={() => setShowPublishToast(false)}
      />

      <OnboardingModal
        isOpen={showOnboarding}
        userName={meData?.me?.name}
        onComplete={handleOnboardingComplete}
      />

    </div>
  );
}
