import { useState, useRef, useCallback, useEffect } from 'react';
import type { Block as BlockType, BlockStyle } from '@/shared/types';
import { ObjectControls } from './ObjectControls';
import styles from './MicroToolbar.module.css';

interface MicroToolbarProps {
  block: BlockType;
  onStyleChange: (style: BlockStyle) => void;
  onDelete: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
}

export function MicroToolbar({
  block,
  onStyleChange,
  onDelete,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
}: MicroToolbarProps) {
  const [showStylePanel, setShowStylePanel] = useState(false);
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const stylePanelRef = useRef<HTMLDivElement>(null);
  const layerMenuRef = useRef<HTMLDivElement>(null);

  // Close panels when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      
      // Close style panel if clicked outside
      if (showStylePanel && stylePanelRef.current && !stylePanelRef.current.contains(target)) {
        const isToolbarClick = toolbarRef.current?.contains(target);
        if (!isToolbarClick) {
          setShowStylePanel(false);
        }
      }
      
      // Close layer menu if clicked outside
      if (showLayerMenu && layerMenuRef.current && !layerMenuRef.current.contains(target)) {
        const isToolbarClick = toolbarRef.current?.contains(target);
        if (!isToolbarClick) {
          setShowLayerMenu(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showStylePanel, showLayerMenu]);

  const handleStyleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowStylePanel(!showStylePanel);
    setShowLayerMenu(false);
  }, [showStylePanel]);

  const handleLayerClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowLayerMenu(!showLayerMenu);
    setShowStylePanel(false);
  }, [showLayerMenu]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  }, [onDelete]);

  const handleLayerAction = useCallback((action: 'forward' | 'backward' | 'front' | 'back') => {
    switch (action) {
      case 'forward': onBringForward(); break;
      case 'backward': onSendBackward(); break;
      case 'front': onBringToFront(); break;
      case 'back': onSendToBack(); break;
    }
    setShowLayerMenu(false);
  }, [onBringForward, onSendBackward, onBringToFront, onSendToBack]);

  return (
    <div 
      ref={toolbarRef}
      className={styles.toolbar}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Style button */}
      <button 
        className={`${styles.toolbarBtn} ${showStylePanel ? styles.active : ''}`}
        onClick={handleStyleClick}
        title="Style"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
          <path d="M5 19l1.5-3L10 15l-3.5-1L5 11l-1.5 3L0 15l3.5 1L5 19z" />
          <path d="M19 19l1-2 2-1-2-1-1-2-1 2-2 1 2 1 1 2z" />
        </svg>
      </button>

      {/* Layer button */}
      <button 
        className={`${styles.toolbarBtn} ${showLayerMenu ? styles.active : ''}`}
        onClick={handleLayerClick}
        title="Layer order"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      </button>

      {/* Delete button */}
      <button 
        className={`${styles.toolbarBtn} ${styles.deleteBtn}`}
        onClick={handleDeleteClick}
        title="Delete"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>

      {/* Style panel popover */}
      {showStylePanel && (
        <div ref={stylePanelRef} className={styles.stylePanel}>
          <ObjectControls
            blockType={block.type}
            style={block.style}
            onChange={onStyleChange}
          />
        </div>
      )}

      {/* Layer menu */}
      {showLayerMenu && (
        <div ref={layerMenuRef} className={styles.layerMenu}>
          <button onClick={() => handleLayerAction('front')} className={styles.layerMenuItem}>
            Bring to front
          </button>
          <button onClick={() => handleLayerAction('forward')} className={styles.layerMenuItem}>
            Bring forward
          </button>
          <button onClick={() => handleLayerAction('backward')} className={styles.layerMenuItem}>
            Send backward
          </button>
          <button onClick={() => handleLayerAction('back')} className={styles.layerMenuItem}>
            Send to back
          </button>
        </div>
      )}
    </div>
  );
}

