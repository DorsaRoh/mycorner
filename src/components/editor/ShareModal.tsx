import { useState, useCallback, useEffect } from 'react';
import styles from './ShareModal.module.css';

interface ShareModalProps {
  pageId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ShareModal({ pageId, isOpen, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  const publicUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/p/${pageId}`
    : `/p/${pageId}`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = publicUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
    }
  }, [publicUrl]);

  // Reset copied state after delay
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.checkmark}>✓</div>
          <h2>Your space is ready to share</h2>
        </div>

        <p className={styles.subtitle}>Send this link to anyone you'd like:</p>

        <div className={styles.urlBox}>
          <input
            type="text"
            value={publicUrl}
            readOnly
            className={styles.urlInput}
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button 
            className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
            onClick={handleCopy}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <div className={styles.actions}>
          <a 
            href={publicUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className={styles.viewLink}
          >
            View page ↗
          </a>
          <button className={styles.doneBtn} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

