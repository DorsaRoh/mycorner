import { useEffect } from 'react';

interface KeyboardShortcutsProps {
  selectedId: string | null;
  selectedIds: Set<string>;
  blocks: any[];
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
}

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
}: KeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      const isInputFocused = activeTag === 'TEXTAREA' || activeTag === 'INPUT';

      // Dismiss hint on any keyboard interaction
      onFirstInteraction?.();

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
  ]);
}
