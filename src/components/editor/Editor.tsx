import { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation } from '@apollo/client';
import type { Block as BlockType } from '@/shared/types';
import { UPDATE_PAGE, PUBLISH_PAGE } from '@/lib/graphql/mutations';
import { useAutosave } from '@/lib/hooks/useAutosave';
import { Canvas } from './Canvas';
import { InviteModal } from './InviteModal';
import { PageFlipExplore } from './PageFlipExplore';
import styles from './Editor.module.css';

// Accepted image extensions for pasted URLs
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

declare global {
  interface Window {
    __pendingImageData?: string;
  }
}

interface EditorProps {
  pageId: string;
  initialBlocks: BlockType[];
  initialTitle?: string;
  initialPublished?: boolean;
}

export function Editor({ pageId, initialBlocks, initialTitle, initialPublished = false }: EditorProps) {
  const [blocks, setBlocks] = useState<BlockType[]>(initialBlocks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState(initialTitle || '');
  const [isPublished, setIsPublished] = useState(initialPublished);
  const [publishing, setPublishing] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteNeedsAuth, setInviteNeedsAuth] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [newBlockIds, setNewBlockIds] = useState<Set<string>>(new Set());
  
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
        },
      },
    });
  }, [pageId, title, blocks, updatePage]);

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
        width: 220,
        height: 60,
        content: 'your corner of the internet',
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
    
    // Default dimensions based on block type
    let width = 200;
    let height = 100;
    
    if (type === 'TEXT') {
      width = 200;
      height = 100;
    } else if (type === 'LINK') {
      width = 280;
      height = 80;
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
    };

    // Also check for pending image data from toolbar upload
    if (type === 'IMAGE' && !content && window.__pendingImageData) {
      newBlock.content = window.__pendingImageData;
      delete window.__pendingImageData;
    }

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
  }, [blocks.length, generateBlockId]);

  const handleUpdateBlock = useCallback((id: string, updates: Partial<BlockType>) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.id === id ? { ...block, ...updates } : block
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      const isEditing = activeTag === 'TEXTAREA' || activeTag === 'INPUT';
      
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditing) {
        if (selectedIds.size > 0 || selectedId) {
          e.preventDefault();
          handleDeleteSelected();
        }
      }
      
      if (e.key === 'Escape') {
        setSelectedId(null);
        setSelectedIds(new Set());
      }
      
      // Select all with Cmd/Ctrl + A
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && !isEditing) {
        e.preventDefault();
        setSelectedIds(new Set(blocks.map(b => b.id)));
        setSelectedId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, selectedIds, blocks, handleDeleteSelected]);

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
          if (file) {
            const reader = new FileReader();
            reader.onload = () => {
              handleAddBlock('IMAGE', 100, 100 + blocks.length * 30, reader.result as string);
            };
            reader.readAsDataURL(file);
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
          const lowerUrl = url.toLowerCase();
          const isImageUrl = IMAGE_EXTENSIONS.some(ext => lowerUrl.includes(ext));
          
          if (isImageUrl) {
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
          selectedId={selectedId}
          selectedIds={selectedIds}
          newBlockIds={newBlockIds}
          onSelectBlock={handleSelectBlock}
          onSelectMultiple={handleSelectMultiple}
          onUpdateBlock={handleUpdateBlock}
          onDeleteBlock={handleDeleteBlock}
          onAddBlock={handleAddBlock}
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
    </div>
  );
}
