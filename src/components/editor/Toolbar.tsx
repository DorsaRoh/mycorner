import { useRef, useCallback } from 'react';
import type { BlockType } from '@/shared/types';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  pageId: string;
  isPublished: boolean;
  onAddBlock: (type: BlockType, content?: string) => void;
  onPublish: () => void;
  onShare: () => void;
  publishing: boolean;
  saving: boolean;
  lastSaved: Date | null;
  error?: string | null;
}

export function Toolbar({ 
  pageId,
  isPublished,
  onAddBlock, 
  onPublish,
  onShare,
  publishing,
  saving, 
  lastSaved,
  error,
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      // Read file first, then add block with content
      onAddBlock('IMAGE', reader.result as string);
    };
    reader.readAsDataURL(file);
    
    e.target.value = '';
  }, [onAddBlock]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Add Elements</span>
        <div className={styles.actions}>
          <button
            className={styles.btn}
            onClick={() => onAddBlock('TEXT')}
            title="Add text (or double-click canvas)"
          >
            <span className={styles.btnIcon}>T</span>
            <span>Text</span>
          </button>
          <button
            className={styles.btn}
            onClick={handleImageClick}
            title="Add image"
          >
            <span className={styles.btnIcon}>🖼</span>
            <span>Image</span>
          </button>
          <button
            className={styles.btn}
            onClick={() => onAddBlock('LINK')}
            title="Add link"
          >
            <span className={styles.btnIcon}>🔗</span>
            <span>Link</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      <div className={styles.bottomSection}>
        <div className={styles.status}>
          {error ? (
            <span className={styles.error}>{error}</span>
          ) : saving ? (
            <span className={styles.saving}>Saving...</span>
          ) : lastSaved ? (
            <span className={styles.saved}>✓ Saved {formatTime(lastSaved)}</span>
          ) : null}
        </div>

        {isPublished ? (
          <button className={styles.shareBtn} onClick={onShare}>
            Share Page
          </button>
        ) : (
          <button 
            className={styles.publishBtn} 
            onClick={onPublish}
            disabled={publishing}
          >
            {publishing ? 'Publishing...' : 'Publish'}
          </button>
        )}
      </div>
    </div>
  );
}

declare global {
  interface Window {
    __pendingImageData?: string;
  }
}
