import { useState, useCallback, useRef } from 'react';
import type { Block, BackgroundConfig } from '@/shared/types';

interface HistoryState {
  blocks: Block[];
  background: BackgroundConfig | undefined;
}

const MAX_HISTORY_SIZE = 20;

export function useHistory(
  blocks: Block[],
  background: BackgroundConfig | undefined,
  setBlocks: (blocks: Block[]) => void,
  setBackground: (background: BackgroundConfig | undefined) => void
) {
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoRedoAction = useRef(false);

  const saveToHistory = useCallback(() => {
    if (isUndoRedoAction.current) return;

    const currentState: HistoryState = {
      blocks: JSON.parse(JSON.stringify(blocks)),
      background: background ? JSON.parse(JSON.stringify(background)) : undefined,
    };

    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(currentState);
      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
        setHistoryIndex(MAX_HISTORY_SIZE - 1);
        return newHistory;
      }
      setHistoryIndex(newHistory.length - 1);
      return newHistory;
    });
  }, [blocks, background, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const previousState = history[historyIndex - 1];
      isUndoRedoAction.current = true;
      setBlocks(previousState.blocks);
      setBackground(previousState.background);
      setHistoryIndex(historyIndex - 1);
      setTimeout(() => { isUndoRedoAction.current = false; }, 0);
    }
  }, [history, historyIndex, setBlocks, setBackground]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      isUndoRedoAction.current = true;
      setBlocks(nextState.blocks);
      setBackground(nextState.background);
      setHistoryIndex(historyIndex + 1);
      setTimeout(() => { isUndoRedoAction.current = false; }, 0);
    }
  }, [history, historyIndex, setBlocks, setBackground]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return {
    saveToHistory,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
