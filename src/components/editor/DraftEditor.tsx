import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useMutation, useQuery, gql } from '@apollo/client';
import type { Block as BlockType, BackgroundConfig } from '@/shared/types';
import { DEFAULT_STYLE } from '@/shared/types';
import { uploadAsset, isAcceptedImageType } from '@/lib/upload';
import {
  DraftData,
  generateDraftId,
  getDraft,
  saveDraft,
  deleteDraft,
  getActiveDraftId,
  setActiveDraftId,
  setPendingPublish,
  getPendingPublish,
  clearPendingPublish,
  hasStarterBeenDismissed,
  setStarterDismissed,
} from '@/lib/draft';
import { Canvas } from './Canvas';
import { BackgroundPanel } from './BackgroundPanel';
import { AuthGate } from './AuthGate';
import styles from './Editor.module.css';

import { isImageUrl, serializeLinkContent } from '@/shared/utils/blockStyles';

// Starter block ID prefix for identification
const STARTER_BLOCK_PREFIX = 'block_starter_';

/**
 * Creates the starter composition blocks for a new page.
 * These are real canvas objects that can be edited/moved/deleted.
 * Positions are calculated assuming a ~1200x800 viewport.
 */
function createStarterBlocks(): BlockType[] {
  const now = Date.now();
  
  // Center position for headline (assumes ~1200px wide viewport)
  const centerX = 600;
  const headlineWidth = 600;
  
  return [
    // 1. Headline - "your corner of the internet" - big and centered
    {
      id: `${STARTER_BLOCK_PREFIX}headline_${now}`,
      type: 'TEXT',
      x: centerX - headlineWidth / 2,
      y: 180,
      width: headlineWidth,
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
    // 2. Subtitle - "a place for things you like on the web" - centered below headline
    {
      id: `${STARTER_BLOCK_PREFIX}subtitle_${now}`,
      type: 'TEXT',
      x: centerX - 220,
      y: 270,
      width: 440,
      height: 40,
      content: 'a place for things you like on the web',
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
    // 3. Song link gem - left side
    {
      id: `${STARTER_BLOCK_PREFIX}song_${now}`,
      type: 'LINK',
      x: 80,
      y: 380,
      width: 280,
      height: 45,
      content: serializeLinkContent('↗ a song i always come back to', 'https://open.spotify.com/track/...'),
      style: {
        ...DEFAULT_STYLE,
        fontSize: 17,
        fontWeight: 400,
        color: 'rgba(0, 0, 0, 0.5)',
      },
      isStarter: true,
      starterOwned: false,
    },
    // 4. Image placeholder - right side
    {
      id: `${STARTER_BLOCK_PREFIX}image_${now}`,
      type: 'IMAGE',
      x: 780,
      y: 340,
      width: 160,
      height: 120,
      content: '/starter-placeholder.svg',
      style: {
        ...DEFAULT_STYLE,
        borderRadius: 0.08,
      },
      isStarter: true,
      starterOwned: false,
    },
    // 5. Image caption
    {
      id: `${STARTER_BLOCK_PREFIX}caption_${now}`,
      type: 'TEXT',
      x: 780,
      y: 470,
      width: 160,
      height: 30,
      content: 'this color palette',
      style: {
        ...DEFAULT_STYLE,
        fontSize: 13,
        fontWeight: 400,
        color: 'rgba(0, 0, 0, 0.4)',
        textAlign: 'left',
      },
      isStarter: true,
      starterOwned: false,
    },
    // 6. Thought paragraph - lower left
    {
      id: `${STARTER_BLOCK_PREFIX}thought_${now}`,
      type: 'TEXT',
      x: 80,
      y: 480,
      width: 260,
      height: 85,
      content: 'a paragraph of text\nabout why this blog\nchanged how i think',
      style: {
        ...DEFAULT_STYLE,
        fontSize: 15,
        fontWeight: 400,
        color: 'rgba(0, 0, 0, 0.45)',
        textAlign: 'left',
      },
      isStarter: true,
      starterOwned: false,
    },
    // 7. Links cluster - lower right
    {
      id: `${STARTER_BLOCK_PREFIX}github_${now}`,
      type: 'LINK',
      x: 780,
      y: 540,
      width: 130,
      height: 32,
      content: serializeLinkContent('→ my github', 'https://github.com/...'),
      style: {
        ...DEFAULT_STYLE,
        fontSize: 14,
        fontWeight: 400,
        color: 'rgba(0, 0, 0, 0.45)',
      },
      isStarter: true,
      starterOwned: false,
    },
    {
      id: `${STARTER_BLOCK_PREFIX}twitter_${now}`,
      type: 'LINK',
      x: 780,
      y: 578,
      width: 130,
      height: 32,
      content: serializeLinkContent('→ my twitter', 'https://twitter.com/...'),
      style: {
        ...DEFAULT_STYLE,
        fontSize: 14,
        fontWeight: 400,
        color: 'rgba(0, 0, 0, 0.45)',
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

const CREATE_AND_PUBLISH_PAGE = gql`
  mutation CreateAndPublishPage($input: CreatePageInput!, $blocks: [BlockInput!]!, $background: BackgroundConfigInput) {
    createPage(input: $input) {
      id
    }
  }
`;

const UPDATE_PAGE = gql`
  mutation UpdatePage($id: ID!, $input: UpdatePageInput!) {
    updatePage(id: $id, input: $input) {
      page {
        id
      }
    }
  }
`;

const PUBLISH_PAGE = gql`
  mutation PublishPage($id: ID!) {
    publishPage(id: $id) {
      id
      isPublished
    }
  }
`;

interface DraftEditorProps {
  initialDraftId?: string;
}

export function DraftEditor({ initialDraftId }: DraftEditorProps) {
  const router = useRouter();
  const [draftId, setDraftId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<BlockType[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [background, setBackground] = useState<BackgroundConfig | undefined>(undefined);
  const [newBlockIds, setNewBlockIds] = useState<Set<string>>(new Set());
  const [showBackgroundPanel, setShowBackgroundPanel] = useState(false);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState<'idle' | 'saving' | 'saved'>('idle');

  const { data: meData, loading: meLoading, refetch: refetchMe } = useQuery(ME_QUERY);
  const [createPage] = useMutation(CREATE_AND_PUBLISH_PAGE);
  const [updatePage] = useMutation(UPDATE_PAGE);
  const [publishPage] = useMutation(PUBLISH_PAGE);

  const starterBlockAdded = useRef(false);
  const isFirstRender = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingPublishHandled = useRef(false);
  const [starterMode, setStarterMode] = useState(false);

  // Initialize draft on mount
  useEffect(() => {
    // Check for 'fresh' query param to force new draft
    const urlParams = new URLSearchParams(window.location.search);
    const forceFresh = urlParams.get('fresh') === '1';
    
    let id = initialDraftId;

    // Try to resume existing draft (unless fresh=1)
    if (!id && !forceFresh) {
      const activeDraftId = getActiveDraftId();
      if (activeDraftId) {
        const existingDraft = getDraft(activeDraftId);
        if (existingDraft) {
          id = activeDraftId;
        }
      }
    }

    // Create new draft if none exists or fresh=1
    if (!id) {
      id = generateDraftId();
    }

    setDraftId(id);
    setActiveDraftId(id);

    // Load existing draft data
    const draft = getDraft(id);
    if (draft) {
      setTitle(draft.title || '');
      setBlocks(draft.blocks || []);
      setBackground(draft.background);
    }
    
    // Clean up URL if we had fresh param
    if (forceFresh) {
      window.history.replaceState({}, '', '/new');
    }
  }, [initialDraftId]);

  // Add starter blocks for empty pages (starterMode)
  useEffect(() => {
    if (draftId && blocks.length === 0 && !starterBlockAdded.current) {
      const draft = getDraft(draftId);
      // Only show starter if this draft hasn't been started before
      if ((!draft || draft.blocks.length === 0) && !hasStarterBeenDismissed(draftId)) {
        starterBlockAdded.current = true;
        const starterBlocks = createStarterBlocks();
        setBlocks(starterBlocks);
        setStarterMode(true);
        // Auto-select and edit the headline (first block)
        const headlineBlock = starterBlocks[0];
        setSelectedId(headlineBlock.id);
        setEditingId(headlineBlock.id);
      }
    }
  }, [draftId, blocks.length]);

  // Auto-save to localStorage
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (!draftId) return;

    // Debounce saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setSaveIndicator('saving');

    saveTimeoutRef.current = setTimeout(() => {
      const draft: DraftData = {
        id: draftId,
        title,
        blocks,
        background,
        createdAt: getDraft(draftId)?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      saveDraft(draft);
      setSaveIndicator('saved');

      // Clear saved indicator after 2s
      setTimeout(() => setSaveIndicator('idle'), 2000);
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [draftId, title, blocks, background]);

  const handlePublish = useCallback(async () => {
    if (!draftId) return;

    // Check if user is authenticated
    const { data: freshMe } = await refetchMe();
    
    if (!freshMe?.me) {
      // Show auth gate
      setPendingPublish(draftId);
      setShowAuthGate(true);
      return;
    }

    // User is authenticated, proceed with publish
    setPublishing(true);

    try {
      // Save draft one final time
      const draft: DraftData = {
        id: draftId,
        title,
        blocks,
        background,
        createdAt: getDraft(draftId)?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      saveDraft(draft);

      // Create page on server
      const { data: createData } = await createPage({
        variables: {
          input: { title: title || undefined },
        },
      });

      if (!createData?.createPage?.id) {
        throw new Error('Failed to create page');
      }

      const pageId = createData.createPage.id;

      // Update with blocks and background
      await updatePage({
        variables: {
          id: pageId,
          input: {
            title: title || undefined,
            blocks: blocks.map(({ id, type, x, y, width, height, content, style, effects }) => ({
              id,
              type,
              x,
              y,
              width,
              height,
              content,
              style,
              effects,
            })),
            background,
          },
        },
      });

      // Publish the page
      const { data: publishData } = await publishPage({
        variables: { id: pageId },
      });

      if (publishData?.publishPage?.isPublished) {
        // Clear local draft
        deleteDraft(draftId);
        clearPendingPublish();

        // Redirect to published page
        router.push(`/p/${pageId}`);
      } else {
        throw new Error('Failed to publish page');
      }
    } catch (error) {
      console.error('Publish failed:', error);
      setPublishing(false);
    }
  }, [draftId, title, blocks, background, refetchMe, createPage, updatePage, publishPage, router]);

  // Check for pending publish after auth (must be after handlePublish is defined)
  useEffect(() => {
    if (meLoading || pendingPublishHandled.current) return;
    
    const pending = getPendingPublish();
    if (pending && meData?.me && draftId === pending.draftId) {
      // User just authenticated, continue publish
      pendingPublishHandled.current = true;
      clearPendingPublish();
      handlePublish();
    }
  }, [meData?.me, meLoading, draftId, handlePublish]);

  const generateBlockId = useCallback(() => {
    return `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }, []);

  // Exit starter mode when user performs a meaningful interaction
  // Removes only untouched (isStarter && !starterOwned) blocks
  const exitStarterMode = useCallback(() => {
    if (starterMode && draftId) {
      setStarterMode(false);
      setStarterDismissed(draftId);
      // Remove only untouched starter blocks (isStarter && !starterOwned)
      setBlocks((prev) => prev.filter((b) => {
        if (!b.isStarter) return true;
        // Keep blocks that user has modified (owned)
        return b.starterOwned === true;
      }));
      setSelectedId(null);
      setEditingId(null);
    }
  }, [starterMode, draftId]);

  const handleAddBlock = useCallback((type: BlockType['type'], x?: number, y?: number, content?: string) => {
    // Exit starter mode when adding new blocks
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
        
        // If this is a starter block being modified, mark it as owned
        if (block.isStarter && !block.starterOwned) {
          // Check if it's a meaningful modification
          const isContentChange = 'content' in updates && updates.content !== block.content;
          const isPositionChange = ('x' in updates && updates.x !== block.x) || 
                                   ('y' in updates && updates.y !== block.y);
          const isSizeChange = ('width' in updates && updates.width !== block.width) ||
                               ('height' in updates && updates.height !== block.height);
          const isStyleChange = 'style' in updates;
          
          if (isContentChange || isPositionChange || isSizeChange || isStyleChange) {
            // Mark as owned and update style to full opacity for text content
            const newBlock = {
              ...block,
              ...updates,
              starterOwned: true,
            };
            
            // If content changed on TEXT blocks, update to full opacity
            if (isContentChange && (block.type === 'TEXT' || block.type === 'LINK')) {
              newBlock.style = {
                ...DEFAULT_STYLE,
                ...block.style,
                color: 'rgba(0, 0, 0, 0.85)',
              };
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

  const handleDeleteBlock = useCallback((id: string) => {
    // If deleting a starter block, exit starter mode (user is engaging)
    const blockToDelete = blocks.find(b => b.id === id);
    if (blockToDelete?.isStarter && starterMode && draftId) {
      setStarterMode(false);
      setStarterDismissed(draftId);
      // Remove all untouched starter blocks except the one being explicitly deleted
      setBlocks((prev) => prev.filter((b) => {
        if (b.id === id) return false; // Remove the explicitly deleted block
        if (!b.isStarter) return true; // Keep non-starter blocks
        return b.starterOwned === true; // Keep only owned starter blocks
      }));
      if (selectedId === id) {
        setSelectedId(null);
      }
      setSelectedIds(new Set());
      return;
    }
    
    setBlocks((prev) => prev.filter((block) => block.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
    }
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [selectedId, blocks, starterMode, draftId]);

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
    if (id !== null) {
      setSelectedIds(new Set());
    }
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
      if (activeTag === 'TEXTAREA' || activeTag === 'INPUT') {
        return;
      }

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
          const urlIsImage = isImageUrl(url);
          if (urlIsImage) {
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

  if (!draftId) {
    return (
      <div className={styles.loading}>
        <span>Loading...</span>
      </div>
    );
  }

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
          {publishing ? 'Publishing...' : 'Publish'}
        </button>
      </div>

      {/* Save status indicator */}
      <div className={styles.saveIndicator}>
        {saveIndicator === 'saving' ? (
          <span className={styles.saving}>saving…</span>
        ) : saveIndicator === 'saved' ? (
          <span className={styles.saved}>draft saved</span>
        ) : null}
      </div>

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
          onSetEditing={handleSetEditing}
          onExitStarterMode={exitStarterMode}
        />
      </main>

      <AuthGate
        isOpen={showAuthGate}
        onClose={() => setShowAuthGate(false)}
        onAuthStart={() => {
          // The pending publish is already set, just close the modal
          // Auth will redirect and we'll handle it on return
        }}
      />
    </div>
  );
}
