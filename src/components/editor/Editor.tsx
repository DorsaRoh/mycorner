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
  setPendingPublish,
  getPendingPublish,
  clearPendingPublish,
  hasStarterBeenDismissed,
  setStarterDismissed,
} from '@/lib/draft/storage';
import { routes, getPublicUrl, isDraftId } from '@/lib/routes';
import { Canvas } from './Canvas';
import { BackgroundPanel } from './BackgroundPanel';
import { AuthGate } from './AuthGate';
import { PublishToast } from './PublishToast';
import styles from './Editor.module.css';

import { isImageUrl, serializeLinkContent } from '@/shared/utils/blockStyles';

// Starter block ID prefix for identification
const STARTER_BLOCK_PREFIX = 'block_starter_';

/**
 * Creates the starter composition blocks for a new page.
 * These are examples to inspire - user can delete everything and start from zero.
 */
function createStarterBlocks(): BlockType[] {
  const now = Date.now();
  const centerX = 600;
  
  return [
    // Large headline (centered) - the core message
    {
      id: `${STARTER_BLOCK_PREFIX}headline_${now}`,
      type: 'TEXT',
      x: centerX - 300,
      y: 200,
      width: 600,
      height: 80,
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
      x: centerX - 120,
      y: 290,
      width: 240,
      height: 36,
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
    // One image, placed slightly off-center (acts as an emotional anchor)
    {
      id: `${STARTER_BLOCK_PREFIX}image_${now}`,
      type: 'IMAGE',
      x: 720,
      y: 380,
      width: 180,
      height: 140,
      content: '/starter-placeholder.svg',
      style: {
        ...DEFAULT_STYLE,
        borderRadius: 0.06,
      },
      isStarter: true,
      starterOwned: false,
    },
    // One short paragraph, something reflective
    {
      id: `${STARTER_BLOCK_PREFIX}paragraph_${now}`,
      type: 'TEXT',
      x: 100,
      y: 400,
      width: 320,
      height: 50,
      content: 'a place for things you like on the web',
      style: {
        ...DEFAULT_STYLE,
        fontSize: 16,
        fontWeight: 400,
        color: 'rgba(0, 0, 0, 0.45)',
        textAlign: 'left',
      },
      isStarter: true,
      starterOwned: false,
    },
    // Example links, styled organically (not boxed)
    {
      id: `${STARTER_BLOCK_PREFIX}github_${now}`,
      type: 'LINK',
      x: 100,
      y: 490,
      width: 160,
      height: 32,
      content: serializeLinkContent('→ your github', 'https://github.com'),
      style: {
        ...DEFAULT_STYLE,
        fontSize: 15,
        fontWeight: 400,
        color: 'rgba(0, 0, 0, 0.5)',
      },
      isStarter: true,
      starterOwned: false,
    },
    {
      id: `${STARTER_BLOCK_PREFIX}twitter_${now}`,
      type: 'LINK',
      x: 100,
      y: 530,
      width: 160,
      height: 32,
      content: serializeLinkContent('→ your twitter', 'https://twitter.com'),
      style: {
        ...DEFAULT_STYLE,
        fontSize: 15,
        fontWeight: 400,
        color: 'rgba(0, 0, 0, 0.5)',
      },
      isStarter: true,
      starterOwned: false,
    },
    {
      id: `${STARTER_BLOCK_PREFIX}song_${now}`,
      type: 'LINK',
      x: 100,
      y: 570,
      width: 280,
      height: 32,
      content: serializeLinkContent('→ a song I always come back to', 'https://open.spotify.com'),
      style: {
        ...DEFAULT_STYLE,
        fontSize: 15,
        fontWeight: 400,
        color: 'rgba(0, 0, 0, 0.5)',
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
}

export function Editor({ 
  pageId, 
  mode,
  initialBlocks = [],
  initialTitle = '',
  initialBackground,
  initialPublished = false,
  initialServerRevision = 1,
}: EditorProps) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<BlockType[]>(initialBlocks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [background, setBackground] = useState<BackgroundConfig | undefined>(initialBackground);
  const [isPublished, setIsPublished] = useState(initialPublished);
  const [publishing, setPublishing] = useState(false);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [showBackgroundPanel, setShowBackgroundPanel] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [newBlockIds, setNewBlockIds] = useState<Set<string>>(new Set());
  const [starterMode, setStarterMode] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [showPublishToast, setShowPublishToast] = useState(false);
  
  // For draft mode: local save indicator
  const [draftSaveIndicator, setDraftSaveIndicator] = useState<'idle' | 'saving' | 'saved'>('idle');
  
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

  // Queries and mutations
  const { data: meData, loading: meLoading, refetch: refetchMe } = useQuery(ME_QUERY);
  const [createPage] = useMutation(CREATE_PAGE);
  const [updatePage] = useMutation(UPDATE_PAGE);
  const [publishPage] = useMutation(PUBLISH_PAGE);

  // Initialize draft from localStorage for draft mode
  useEffect(() => {
    if (mode === 'draft') {
      setActiveDraftId(pageId);
      const draft = getDraft(pageId);
      if (draft) {
        setTitle(draft.title || '');
        setBlocks(draft.blocks || []);
        setBackground(draft.background);
      }
    }
  }, [mode, pageId]);

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
              id, type, x, y, width, height, content, style, effects,
            })),
            background: backgroundRef.current,
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

  // Initialize save controller for server mode
  const {
    saveState,
    isOffline,
    markDirty,
    saveNow,
    retry,
  } = useSaveController({
    debounceMs: 1000,
    onSave: handleServerSave,
    initialServerRevision,
    onConflict: () => setShowConflictModal(true),
    debug: process.env.NODE_ENV === 'development',
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

    setDraftSaveIndicator('saving');

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
      setDraftSaveIndicator('saved');
      setTimeout(() => setDraftSaveIndicator('idle'), 2000);
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [mode, pageId, title, blocks, background]);

  // Handle publish - unified for both modes
  const handlePublish = useCallback(async () => {
    // Check if user is authenticated
    const { data: freshMe } = await refetchMe();
    
    if (!freshMe?.me) {
      // Store pending publish and show auth gate
      setPendingPublish(pageId);
      setShowAuthGate(true);
      return;
    }

    setPublishing(true);

    try {
      let serverPageId = pageId;

      if (mode === 'draft' || isDraftId(pageId)) {
        // Draft mode: create page on server first
        const draft = getDraft(pageId);
        
        // Create page
        const { data: createData } = await createPage({
          variables: { input: { title: title || undefined } },
        });

        if (!createData?.createPage?.id) {
          throw new Error('Failed to create page');
        }

        serverPageId = createData.createPage.id;

        // Update with blocks and background
        await updatePage({
          variables: {
            id: serverPageId,
            input: {
              title: title || undefined,
              blocks: blocks.map(({ id, type, x, y, width, height, content, style, effects }) => ({
                id, type, x, y, width, height, content, style, effects,
              })),
              background,
            },
          },
        });
      } else {
        // Server mode: just save first
        await saveNow();
      }

      // Publish the page
      const { data: publishData } = await publishPage({
        variables: { id: serverPageId },
      });

      if (publishData?.publishPage?.isPublished) {
        // Success!
        setIsPublished(true);
        
        // Clear draft if we were in draft mode
        if (mode === 'draft' || isDraftId(pageId)) {
          deleteDraft(pageId);
          clearPendingPublish();
        }

        // Show success toast with public URL
        const publicUrl = getPublicUrl(serverPageId);
        setPublishedUrl(publicUrl);
        setShowPublishToast(true);

        // If we were a draft, navigate to the server page URL
        if (mode === 'draft' || isDraftId(pageId)) {
          router.replace(routes.edit(serverPageId));
        }
      } else {
        throw new Error('Failed to publish page');
      }
    } catch (error) {
      console.error('Publish failed:', error);
    } finally {
      setPublishing(false);
    }
  }, [mode, pageId, title, blocks, background, refetchMe, createPage, updatePage, publishPage, saveNow, router]);

  // Check for pending publish after auth
  useEffect(() => {
    if (meLoading || pendingPublishHandled.current) return;
    
    const pending = getPendingPublish();
    if (pending && meData?.me && pageId === pending.draftId) {
      pendingPublishHandled.current = true;
      clearPendingPublish();
      handlePublish();
    }
  }, [meData?.me, meLoading, pageId, handlePublish]);

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

    const newBlock: BlockType = {
      id: newId,
      type,
      x: x ?? 100,
      y: y ?? 100 + blocks.length * 20,
      width,
      height,
      content: content ?? '',
      ...(fontSize && { style: { ...DEFAULT_STYLE, fontSize } }),
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
  }, [blocks.length, generateBlockId, exitStarterMode]);

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
          return { ...block, x: Math.max(0, block.x + dx), y: Math.max(0, block.y + dy) };
        }
        return block;
      })
    );
  }, []);

  const handleDeleteBlock = useCallback((id: string) => {
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
  }, [selectedId, blocks, starterMode, pageId]);

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
  }, [selectedId, selectedIds, blocks, editingId, handleDeleteSelected]);

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

  // Determine save status display
  const renderSaveStatus = () => {
    if (mode === 'draft') {
      if (draftSaveIndicator === 'saving') return <span className={styles.saving}>saving…</span>;
      if (draftSaveIndicator === 'saved') return <span className={styles.saved}>draft saved</span>;
      return null;
    } else {
      if (isOffline) return <span className={styles.offline}>offline</span>;
      if (saveState === 'error') return <button className={styles.saveError} onClick={retry}>couldn&apos;t save · retry</button>;
      if (saveState === 'saving') return <span className={styles.saving}>saving…</span>;
      if (saveState === 'saved') return <span className={styles.saved}>saved</span>;
      if (saveState === 'dirty') return <span className={styles.saving}>•</span>;
      return null;
    }
  };

  return (
    <div className={styles.editor}>
      {/* Top right controls */}
      <div className={styles.topRightControls}>
        <div className={styles.backgroundBtnWrapper}>
          <button
            className={`${styles.backgroundBtn} ${showBackgroundPanel ? styles.backgroundBtnActive : ''}`}
            onClick={() => setShowBackgroundPanel(!showBackgroundPanel)}
            data-background-btn
            title="Background"
          >
            <span className={styles.backgroundIcon} />
          </button>
          {showBackgroundPanel && (
            <BackgroundPanel
              background={background}
              onChange={setBackground}
              onClose={() => setShowBackgroundPanel(false)}
            />
          )}
        </div>
        <button
          className={styles.inviteBtn}
          onClick={handlePublish}
          disabled={publishing}
        >
          {publishing ? 'Publishing...' : isPublished ? 'Published ✓' : 'Publish'}
        </button>
      </div>

      {/* Published URL indicator (minimal) */}
      {isPublished && publishedUrl && (
        <div className={styles.publishedUrl}>
          <a href={publishedUrl} target="_blank" rel="noopener noreferrer">
            {publishedUrl.replace(/^https?:\/\//, '')}
          </a>
        </div>
      )}

      {/* Save status indicator */}
      <div className={styles.saveIndicator}>
        {renderSaveStatus()}
      </div>
      
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
        />
      </main>

      <AuthGate
        isOpen={showAuthGate}
        onClose={() => setShowAuthGate(false)}
        onAuthStart={() => {
          // Pending publish is already set, auth will handle return
        }}
      />

      <PublishToast
        isOpen={showPublishToast}
        url={publishedUrl}
        onClose={() => setShowPublishToast(false)}
      />
    </div>
  );
}
