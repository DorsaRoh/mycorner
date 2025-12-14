import { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation } from '@apollo/client';
import type { Block as BlockType, BackgroundConfig } from '@/shared/types';
import { DEFAULT_STYLE } from '@/shared/types';
import { UPDATE_PAGE, PUBLISH_PAGE } from '@/lib/graphql/mutations';
import { useAutosave } from '@/lib/hooks/useAutosave';
import { uploadAsset, isAcceptedImageType } from '@/lib/upload';
import { Canvas } from './Canvas';
import { InviteModal } from './InviteModal';
import { PageFlipExplore } from './PageFlipExplore';
import { BackgroundPanel } from './BackgroundPanel';
import styles from './Editor.module.css';

import { IMAGE_EXTENSIONS, isImageUrl } from '@/shared/utils/blockStyles';


interface EditorProps {
  pageId: string;
  initialBlocks: BlockType[];
  initialTitle?: string;
  initialBackground?: BackgroundConfig;
  initialPublished?: boolean;
}

export function Editor({ pageId, initialBlocks, initialTitle, initialBackground, initialPublished = false }: EditorProps) {
  const [blocks, setBlocks] = useState<BlockType[]>(initialBlocks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState(initialTitle || '');
  const [background, setBackground] = useState<BackgroundConfig | undefined>(initialBackground);
  const [isPublished, setIsPublished] = useState(initialPublished);
  const [publishing, setPublishing] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteNeedsAuth, setInviteNeedsAuth] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [newBlockIds, setNewBlockIds] = useState<Set<string>>(new Set());
  const [showBackgroundPanel, setShowBackgroundPanel] = useState(false);
  
  // Track if we've already added the starter block for this session
  const starterBlockAdded = useRef(false);

  const [updatePage] = useMutation(UPDATE_PAGE);
  const [publishPage] = useMutation(PUBLISH_PAGE);

  const handleSave = useCallback(async () => {
    await updatePage({
      variables: {
        id: pageId,
        input: {
          title: title || null,
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
  }, [pageId, title, blocks, background, updatePage]);

  const { trigger: triggerAutosave, saveNow, saving, lastSaved, error: saveError, retry } = useAutosave({
    delay: 1000,
    onSave: handleSave,
  });

  // Trigger autosave when blocks or title change
  useEffect(() => {
    triggerAutosave();
  }, [blocks, title, triggerAutosave]);

  // Add starter block for empty new pages (only once)
  useEffect(() => {
    if (initialBlocks.length === 0 && blocks.length === 0 && !starterBlockAdded.current) {
      starterBlockAdded.current = true;
      const starterBlock: BlockType = {
        id: `block_starter_${Date.now()}`,
        type: 'TEXT',
        x: 60,
        y: 40,
        width: 500,
        height: 80,
        content: 'your corner of the internet',
        style: {
          ...DEFAULT_STYLE,
          fontSize: 60,
        },
      };
      setBlocks([starterBlock]);
      // Don't mark as new (no animation) since it's the starter
    }
  }, [initialBlocks.length, blocks.length]);

  const handleInvite = useCallback(async () => {
    // If not published yet, publish first
    if (!isPublished) {
      setPublishing(true);
      setPublishError(null);
      setInviteNeedsAuth(false);
      
      try {
        // Save first
        await saveNow();
        
        const { data } = await publishPage({
          variables: { id: pageId },
        });
        
        if (data?.publishPage?.isPublished) {
          setIsPublished(true);
          setShowInviteModal(true);
        } else {
          setPublishError('Unable to publish. Please try again.');
          setShowInviteModal(true);
        }
      } catch (error) {
        console.error('Publish failed:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('Authentication')) {
          // Show auth gating modal instead of harsh toast
          setInviteNeedsAuth(true);
          setShowInviteModal(true);
        } else {
          setPublishError('Something went wrong. Please try again.');
          setShowInviteModal(true);
        }
      } finally {
        setPublishing(false);
      }
    } else {
      // Already published, just show the modal
      setShowInviteModal(true);
    }
  }, [isPublished, pageId, saveNow, publishPage]);

  const generateBlockId = useCallback(() => {
    return `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }, []);

  const handleAddBlock = useCallback((type: BlockType['type'], x?: number, y?: number, content?: string) => {
    const newId = generateBlockId();
    
    // Default dimensions and font size based on block type
    let width = 200;
    let height = 100;
    let fontSize: number | undefined;
    
    if (type === 'TEXT') {
      // Larger text with bigger font
      width = 300;
      height = 80;
      fontSize = 60;
    } else if (type === 'LINK') {
      // Link with medium font
      width = 200;
      height = 60;
      fontSize = 40;
    } else if (type === 'IMAGE') {
      // Larger default for images with 4:3 aspect ratio
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

    // Track this as a new block for animation
    setNewBlockIds(prev => new Set(prev).add(newId));
    // Remove from new blocks after animation completes
    setTimeout(() => {
      setNewBlockIds(prev => {
        const next = new Set(prev);
        next.delete(newId);
        return next;
      });
    }, 200);

    setBlocks((prev) => [...prev, newBlock]);
    setSelectedId(newBlock.id);
    
    // Immediately enter edit mode for TEXT and LINK blocks so editing starts right away
    if (type === 'TEXT' || type === 'LINK') {
      setEditingId(newId);
    }
  }, [blocks.length, generateBlockId]);

  const handleUpdateBlock = useCallback((id: string, updates: Partial<BlockType>) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.id === id ? { ...block, ...updates } : block
      )
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
    setBlocks((prev) => prev.filter((block) => block.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
    }
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [selectedId]);

  // Delete all selected blocks
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
    // Clear multi-selection when single-selecting
    if (id !== null) {
      setSelectedIds(new Set());
    }
  }, []);

  const handleSelectMultiple = useCallback((ids: Set<string>) => {
    setSelectedIds(ids);
    // If exactly one block selected, make it the primary selection
    if (ids.size === 1) {
      const [singleId] = ids;
      setSelectedId(singleId);
    } else if (ids.size > 1) {
      setSelectedId(null);
    }
  }, []);

  // Handle setting editing state
  const handleSetEditing = useCallback((id: string | null) => {
    setEditingId(id);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      const isInputFocused = activeTag === 'TEXTAREA' || activeTag === 'INPUT';
      
      // Delete/Backspace: only delete objects if not actively editing text
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputFocused && !editingId) {
        if (selectedIds.size > 0 || selectedId) {
          e.preventDefault();
          handleDeleteSelected();
        }
      }
      
      // Escape: first exit edit mode, then deselect
      if (e.key === 'Escape') {
        if (editingId) {
          // Exit edit mode but keep selected
          setEditingId(null);
          // Blur any focused element
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        } else {
          // Deselect
          setSelectedId(null);
          setSelectedIds(new Set());
        }
      }
      
      // Select all with Cmd/Ctrl + A
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && !isInputFocused) {
        e.preventDefault();
        setSelectedIds(new Set(blocks.map(b => b.id)));
        setSelectedId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, selectedIds, blocks, editingId, handleDeleteSelected]);

  // Handle paste (Ctrl+V / Cmd+V) - images, links, or text
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // Don't handle paste if user is typing in an input/textarea
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'TEXTAREA' || activeTag === 'INPUT') {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      // Check for images first
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file && isAcceptedImageType(file.type)) {
            // Upload file first, then create block with URL
            const result = await uploadAsset(file);
            if (result.success) {
              handleAddBlock('IMAGE', 100, 100 + blocks.length * 30, result.data.url);
            } else {
              console.error('Paste upload failed:', result.error);
            }
          }
          return;
        }
      }

      // Check for text (could be URL or plain text)
      const text = e.clipboardData?.getData('text/plain')?.trim();
      if (text) {
        e.preventDefault();
        
        // Check if it's a URL
        const urlPattern = /^(https?:\/\/|www\.)[^\s]+$/i;
        if (urlPattern.test(text)) {
          let url = text;
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
          }
          
          // Check if it's an image URL
          const urlIsImage = isImageUrl(url);
          
          if (urlIsImage) {
            handleAddBlock('IMAGE', 100, 100 + blocks.length * 30, url);
          } else {
            handleAddBlock('LINK', 100, 100 + blocks.length * 30, url);
          }
        } else {
          // Plain text
          handleAddBlock('TEXT', 100, 100 + blocks.length * 30, text);
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [blocks.length, handleAddBlock]);

  return (
    <div className={styles.editor}>
      {/* Top right controls */}
      <div className={styles.topRightControls}>
        <button
          className={`${styles.backgroundBtn} ${showBackgroundPanel ? styles.backgroundBtnActive : ''}`}
          onClick={() => setShowBackgroundPanel(!showBackgroundPanel)}
          title="Background settings"
        >
          ■
        </button>
        <button
          className={styles.inviteBtn}
          onClick={handleInvite}
          disabled={publishing}
        >
          {publishing ? 'Publishing...' : 'Invite'}
        </button>
      </div>

      {/* Save status indicator - subtle, top left */}
      {(saving || saveError || lastSaved) && (
        <div className={styles.saveIndicator}>
          {saveError ? (
            <button className={styles.saveError} onClick={retry}>
              trouble saving · retry
            </button>
          ) : saving ? (
            <span className={styles.saving}>saving…</span>
          ) : lastSaved ? (
            <span className={styles.saved}>saved</span>
          ) : null}
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
          onSelectBlock={handleSelectBlock}
          onSelectMultiple={handleSelectMultiple}
          onUpdateBlock={handleUpdateBlock}
          onDeleteBlock={handleDeleteBlock}
          onAddBlock={handleAddBlock}
          onUpdateMultipleBlocks={handleUpdateMultipleBlocks}
          onSetEditing={handleSetEditing}
        />
      </main>

      {/* Page flip for Explore - in very corner */}
      <PageFlipExplore />

      <InviteModal
        pageId={pageId}
        isOpen={showInviteModal}
        onClose={() => {
          setShowInviteModal(false);
          setPublishError(null);
          setInviteNeedsAuth(false);
        }}
        needsAuth={inviteNeedsAuth}
        publishError={publishError}
      />

      {showBackgroundPanel && (
        <BackgroundPanel
          background={background}
          onChange={setBackground}
          onClose={() => setShowBackgroundPanel(false)}
        />
      )}
    </div>
  );
}
