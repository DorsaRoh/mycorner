import { useEffect, useCallback } from 'react';
import type { Block } from '@/shared/types';

interface KeyboardShortcutsProps {
  selectedId: string | null;
  selectedIds: Set<string>;
  blocks: Block[];
  editingId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelected: () => void;
  onSelectAll: () => void;
  onEscape: () => void;
  onSetEditing: (id: string | null) => void;
  onFirstInteraction?: () => void;
  onDuplicateBlocks?: (blocks: Block[]) => void;
}

// Module-level clipboard to persist copied blocks across re-renders
let clipboardBlocks: Block[] = [];

export function useKeyboardShortcuts({
  selectedId,
  selectedIds,
  blocks,
  editingId,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDeleteSelected,
  onSelectAll,
  onEscape,
  onSetEditing,
  onFirstInteraction,
  onDuplicateBlocks,
}: KeyboardShortcutsProps) {
  // Copy selected blocks to internal clipboard
  const copySelectedBlocks = useCallback(() => {
    const blocksToCopy: Block[] = [];
    
    if (selectedIds.size > 0) {
      // Copy multiple selected blocks
      for (const id of selectedIds) {
        const block = blocks.find(b => b.id === id);
        if (block) {
          blocksToCopy.push({ ...block });
        }
      }
    } else if (selectedId) {
      // Copy single selected block
      const block = blocks.find(b => b.id === selectedId);
      if (block) {
        blocksToCopy.push({ ...block });
      }
    }
    
    if (blocksToCopy.length > 0) {
      // Deep clone to preserve all properties including style and effects
      clipboardBlocks = JSON.parse(JSON.stringify(blocksToCopy));
    }
  }, [blocks, selectedId, selectedIds]);

  // Paste blocks from internal clipboard
  const pasteBlocks = useCallback(() => {
    if (clipboardBlocks.length > 0 && onDuplicateBlocks) {
      // Deep clone the clipboard blocks
      const blocksToPaste: Block[] = JSON.parse(JSON.stringify(clipboardBlocks));
      onDuplicateBlocks(blocksToPaste);
      return true;
    }
    return false;
  }, [onDuplicateBlocks]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      const isInputFocused = activeTag === 'TEXTAREA' || activeTag === 'INPUT';

      // Dismiss hint on any keyboard interaction
      onFirstInteraction?.();

      // Copy: Ctrl+C / Cmd+C
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !isInputFocused) {
        if (selectedIds.size > 0 || selectedId) {
          copySelectedBlocks();
          // Don't prevent default - let the system copy also work for text
        }
        return;
      }

      // Paste: Ctrl+V / Cmd+V (internal block paste)
      if ((e.metaKey || e.ctrlKey) && e.key === 'v' && !isInputFocused) {
        // Try internal paste first
        if (pasteBlocks()) {
          e.preventDefault();
          return;
        }
        // If no internal blocks to paste, let the default paste handler handle it
        return;
      }

      // Undo: Ctrl+Z / Cmd+Z
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && !isInputFocused) {
        e.preventDefault();
        if (canUndo) onUndo();
        return;
      }

      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y / Cmd+Y
      if ((e.metaKey || e.ctrlKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y') && !isInputFocused) {
        e.preventDefault();
        if (canRedo) onRedo();
        return;
      }

      // Delete selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputFocused && !editingId) {
        if (selectedIds.size > 0 || selectedId) {
          e.preventDefault();
          onDeleteSelected();
        }
      }

      // Escape
      if (e.key === 'Escape') {
        if (editingId) {
          onSetEditing(null);
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        } else {
          onEscape();
        }
      }

      // Select all: Ctrl+A / Cmd+A
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && !isInputFocused) {
        e.preventDefault();
        onSelectAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedId,
    selectedIds,
    editingId,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onDeleteSelected,
    onSelectAll,
    onEscape,
    onSetEditing,
    onFirstInteraction,
    copySelectedBlocks,
    pasteBlocks,
  ]);
}

// Export for clearing clipboard if needed (e.g., on logout)
export function clearBlockClipboard() {
  clipboardBlocks = [];
}
