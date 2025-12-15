import { useCallback } from 'react';
import type { Block, BlockType, BackgroundConfig } from '@/shared/types';
import { DEFAULT_STYLE } from '@/shared/types';
import { REFERENCE_WIDTH, REFERENCE_HEIGHT, clampToSafeZone } from '@/lib/canvas';
import { routes, isDraftId } from '@/lib/routes';
import { setStarterDismissed } from '@/lib/draft/storage';

interface EditorStateActions {
  setBlocks: React.Dispatch<React.SetStateAction<Block[]>>;
  setSelectedId: (id: string | null) => void;
  setSelectedIds: (ids: Set<string>) => void;
  setEditingId: (id: string | null) => void;
  setNewBlockIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setStarterMode: React.Dispatch<React.SetStateAction<boolean>>;
}

const STARTER_BLOCK_PREFIX = 'block_starter_';

export function useEditorActions(
  pageId: string,
  blocks: Block[],
  starterMode: boolean,
  selectedId: string | null,
  selectedIds: Set<string>,
  actions: EditorStateActions
) {
  const generateBlockId = useCallback(() => {
    return `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }, []);

  const exitStarterMode = useCallback(() => {
    if (starterMode) {
      actions.setStarterMode(false);
      setStarterDismissed(pageId);
      actions.setSelectedId(null);
      actions.setEditingId(null);
    }
  }, [starterMode, pageId, actions]);

  const handleAddBlock = useCallback((type: BlockType, x?: number, y?: number, content?: string) => {
    exitStarterMode();

    const newId = generateBlockId();
    let width = 200;
    let height = 100;

    if (type === 'TEXT') {
      width = 300;
      height = 80;
    } else if (type === 'LINK') {
      width = 200;
      height = 60;
    } else if (type === 'IMAGE') {
      width = 320;
      height = 240;
    }

    const targetX = x ?? 100;
    const targetY = y ?? 100 + blocks.length * 20;
    const { x: safeX, y: safeY } = clampToSafeZone(targetX, targetY, width, height);

    const newBlock: Block = {
      id: newId,
      type,
      x: safeX,
      y: safeY,
      width,
      height,
      content: content ?? '',
      style: type === 'TEXT' || type === 'LINK' ? { ...DEFAULT_STYLE, fontSize: type === 'TEXT' ? 60 : 40 } : DEFAULT_STYLE,
    };

    actions.setNewBlockIds(prev => new Set(prev).add(newId));
    setTimeout(() => {
      actions.setNewBlockIds(prev => {
        const next = new Set(prev);
        next.delete(newId);
        return next;
      });
    }, 200);

    actions.setBlocks((prev) => [...prev, newBlock]);
    actions.setSelectedId(newBlock.id);

    if (type === 'TEXT' || type === 'LINK') {
      actions.setEditingId(newId);
    }
  }, [blocks.length, generateBlockId, exitStarterMode, actions]);

  const handleUpdateBlock = useCallback((id: string, updates: Partial<Block>) => {
    actions.setBlocks((prev) =>
      prev.map((block) =>
        block.id === id ? { ...block, ...updates } : block
      )
    );
  }, [actions]);

  const handleUpdateMultipleBlocks = useCallback((ids: Set<string>, updates: Partial<Block>) => {
    actions.setBlocks((prev) =>
      prev.map((block) =>
        ids.has(block.id) ? { ...block, ...updates } : block
      )
    );
  }, [actions]);

  const handleDragMultipleBlocks = useCallback((ids: Set<string>, dx: number, dy: number) => {
    actions.setBlocks((prev) =>
      prev.map((block) => {
        if (ids.has(block.id)) {
          const rawX = block.x + dx;
          const rawY = block.y + dy;
          const { x: newX, y: newY } = clampToSafeZone(rawX, rawY, block.width, block.height);
          return { ...block, x: newX, y: newY };
        }
        return block;
      })
    );
  }, [actions]);

  const handleDeleteBlock = useCallback((id: string) => {
    const blockToDelete = blocks.find(b => b.id === id);
    if (blockToDelete?.isStarter && starterMode) {
      actions.setStarterMode(false);
      setStarterDismissed(pageId);
    }

    actions.setBlocks((prev) => prev.filter((block) => block.id !== id));
    if (selectedId === id) actions.setSelectedId(null);
    // For now, just clear the selection - the complex logic can be simplified
    actions.setSelectedIds(new Set());
  }, [selectedId, blocks, starterMode, pageId, actions]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size > 0) {
      actions.setBlocks((prev) => prev.filter((block) => !selectedIds.has(block.id)));
      actions.setSelectedIds(new Set());
      actions.setSelectedId(null);
    } else if (selectedId) {
      handleDeleteBlock(selectedId);
    }
  }, [selectedId, selectedIds, handleDeleteBlock]);

  // Layer ordering functions
  const handleBringForward = useCallback((id: string) => {
    actions.setBlocks((prev) => {
      const index = prev.findIndex(b => b.id === id);
      if (index === -1 || index === prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, [actions]);

  const handleSendBackward = useCallback((id: string) => {
    actions.setBlocks((prev) => {
      const index = prev.findIndex(b => b.id === id);
      if (index <= 0) return prev;
      const next = [...prev];
      [next[index], next[index - 1]] = [next[index - 1], next[index]];
      return next;
    });
  }, [actions]);

  const handleBringToFront = useCallback((id: string) => {
    actions.setBlocks((prev) => {
      const index = prev.findIndex(b => b.id === id);
      if (index === -1 || index === prev.length - 1) return prev;
      const block = prev[index];
      return [...prev.slice(0, index), ...prev.slice(index + 1), block];
    });
  }, [actions]);

  const handleSendToBack = useCallback((id: string) => {
    actions.setBlocks((prev) => {
      const index = prev.findIndex(b => b.id === id);
      if (index <= 0) return prev;
      const block = prev[index];
      return [block, ...prev.slice(0, index), ...prev.slice(index + 1)];
    });
  }, [actions]);

  return {
    handleAddBlock,
    handleUpdateBlock,
    handleUpdateMultipleBlocks,
    handleDragMultipleBlocks,
    handleDeleteBlock,
    handleDeleteSelected,
    handleBringForward,
    handleSendBackward,
    handleBringToFront,
    handleSendToBack,
    exitStarterMode,
  };
}
