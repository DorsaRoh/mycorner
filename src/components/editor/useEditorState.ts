import { useState, useCallback } from 'react';
import type { Block, BackgroundConfig } from '@/shared/types';

export interface EditorState {
  blocks: Block[];
  selectedId: string | null;
  selectedIds: Set<string>;
  editingId: string | null;
  title: string;
  background: BackgroundConfig | undefined;
  isPublished: boolean;
  publishedRevision: number | null;
  publishing: boolean;
  publishError: string | null;
  showBackgroundPanel: boolean;
  showAuthGate: boolean;
  showConflictModal: boolean;
  newBlockIds: Set<string>;
  starterMode: boolean;
  publishedUrl: string | null;
  showPublishToast: boolean;
  showOnboarding: boolean;
  pendingPublishAfterOnboarding: boolean;
  showFeedbackModal: boolean;
}

export interface EditorStateActions {
  setBlocks: React.Dispatch<React.SetStateAction<Block[]>>;
  setSelectedId: (id: string | null) => void;
  setSelectedIds: (ids: Set<string>) => void;
  setEditingId: (id: string | null) => void;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
  setBackground: React.Dispatch<React.SetStateAction<BackgroundConfig | undefined>>;
  setIsPublished: React.Dispatch<React.SetStateAction<boolean>>;
  setPublishedRevision: React.Dispatch<React.SetStateAction<number | null>>;
  setPublishing: React.Dispatch<React.SetStateAction<boolean>>;
  setPublishError: React.Dispatch<React.SetStateAction<string | null>>;
  setShowBackgroundPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowAuthGate: React.Dispatch<React.SetStateAction<boolean>>;
  setShowConflictModal: React.Dispatch<React.SetStateAction<boolean>>;
  setNewBlockIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setStarterMode: React.Dispatch<React.SetStateAction<boolean>>;
  setPublishedUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setShowPublishToast: React.Dispatch<React.SetStateAction<boolean>>;
  setShowOnboarding: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingPublishAfterOnboarding: React.Dispatch<React.SetStateAction<boolean>>;
  setShowFeedbackModal: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useEditorState(
  initialBlocks: Block[],
  initialTitle: string,
  initialBackground: BackgroundConfig | undefined,
  initialPublished: boolean,
  initialPublishedRevision: number | null,
  initialPublishedUrl: string | null = null
): EditorState & EditorStateActions {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [background, setBackground] = useState<BackgroundConfig | undefined>(initialBackground);
  const [isPublished, setIsPublished] = useState(initialPublished);
  const [publishedRevision, setPublishedRevision] = useState<number | null>(initialPublishedRevision);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [showBackgroundPanel, setShowBackgroundPanel] = useState(false);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [newBlockIds, setNewBlockIds] = useState<Set<string>>(new Set());
  const [starterMode, setStarterMode] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(initialPublishedUrl);
  const [showPublishToast, setShowPublishToast] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [pendingPublishAfterOnboarding, setPendingPublishAfterOnboarding] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const handleSelectBlock = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id !== null) setSelectedIds(new Set());
  }, []);

  const handleSelectMultiple = useCallback((ids: Set<string>) => {
    setSelectedIds(() => ids);
    if (ids.size === 1) {
      const [singleId] = ids;
      setSelectedId(singleId);
    } else if (ids.size > 1) {
      setSelectedId(null);
    }
  }, []);

  return {
    blocks,
    selectedId,
    selectedIds,
    editingId,
    title,
    background,
    isPublished,
    publishedRevision,
    publishing,
    publishError,
    showBackgroundPanel,
    showAuthGate,
    showConflictModal,
    newBlockIds,
    starterMode,
    publishedUrl,
    showPublishToast,
    showOnboarding,
    pendingPublishAfterOnboarding,
    showFeedbackModal,
    setBlocks,
    setSelectedId: handleSelectBlock,
    setSelectedIds: handleSelectMultiple,
    setEditingId,
    setTitle,
    setBackground,
    setIsPublished,
    setPublishedRevision,
    setPublishing,
    setPublishError,
    setShowBackgroundPanel,
    setShowAuthGate,
    setShowConflictModal,
    setNewBlockIds,
    setStarterMode,
    setPublishedUrl,
    setShowPublishToast,
    setShowOnboarding,
    setPendingPublishAfterOnboarding,
    setShowFeedbackModal,
  };
}
