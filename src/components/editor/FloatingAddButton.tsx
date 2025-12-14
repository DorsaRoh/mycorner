import { useState, useCallback, useRef, useEffect } from 'react';
import type { BlockType } from '@/shared/types';
import styles from './FloatingAddButton.module.css';

// Accepted image types for validation
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

interface FloatingAddButtonProps {
  onAddBlock: (type: BlockType, content?: string) => void;
  showHelper?: boolean;
  onInteraction?: () => void;
}

export function FloatingAddButton({ onAddBlock, showHelper = false, onInteraction }: FloatingAddButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [imageError, setImageError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowLinkInput(false);
        setLinkUrl('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Focus link input when shown
  useEffect(() => {
    if (showLinkInput && linkInputRef.current) {
      linkInputRef.current.focus();
    }
  }, [showLinkInput]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
    setShowLinkInput(false);
    setLinkUrl('');
    // Notify parent of interaction
    onInteraction?.();
  }, [onInteraction]);

  const handleAddText = useCallback(() => {
    onAddBlock('TEXT');
    setIsOpen(false);
  }, [onAddBlock]);

  const handleImageClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate image type
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setImageError('Please use PNG, JPG, WebP, or GIF');
      setTimeout(() => setImageError(null), 3000);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      onAddBlock('IMAGE', reader.result as string);
    };
    reader.readAsDataURL(file);
    
    e.target.value = '';
    setIsOpen(false);
  }, [onAddBlock]);

  const handleLinkClick = useCallback(() => {
    setShowLinkInput(true);
  }, []);

  const handleLinkSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (linkUrl.trim()) {
      let url = linkUrl.trim();
      // Add https:// if no protocol specified
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      onAddBlock('LINK', url);
      setLinkUrl('');
      setShowLinkInput(false);
      setIsOpen(false);
    }
  }, [linkUrl, onAddBlock]);

  const handleLinkKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowLinkInput(false);
      setLinkUrl('');
    }
  }, []);

  return (
    <div className={styles.container} ref={menuRef}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.gif"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Helper label for first-time users */}
      {showHelper && !isOpen && (
        <div className={styles.helperLabel}>
          add something
        </div>
      )}

      {/* Image error message */}
      {imageError && (
        <div className={styles.errorMessage}>
          {imageError}
        </div>
      )}

      {/* Popover menu */}
      {isOpen && (
        <div className={styles.menu}>
          {showLinkInput ? (
            <form onSubmit={handleLinkSubmit} className={styles.linkForm}>
              <input
                ref={linkInputRef}
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={handleLinkKeyDown}
                placeholder="Paste a URL..."
                className={styles.linkInput}
              />
              <button 
                type="submit" 
                className={styles.linkSubmit}
                disabled={!linkUrl.trim()}
              >
                Add
              </button>
            </form>
          ) : (
            <>
              <button className={styles.menuItem} onClick={handleAddText}>
                <span className={styles.menuIcon}>✎</span>
                <span>Write</span>
              </button>
              <button className={styles.menuItem} onClick={handleImageClick}>
                <span className={styles.menuIcon}>◻</span>
                <span>Add image</span>
              </button>
              <button className={styles.menuItem} onClick={handleLinkClick}>
                <span className={styles.menuIcon}>↗</span>
                <span>Add link</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* FAB button */}
      <button 
        className={`${styles.fab} ${isOpen ? styles.fabOpen : ''}`}
        onClick={handleToggle}
        aria-label="Add element"
      >
        <span className={styles.fabIcon}>+</span>
      </button>
    </div>
  );
}
