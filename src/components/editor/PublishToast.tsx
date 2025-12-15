import { useState, useCallback, useEffect } from 'react';
import styles from './PublishToast.module.css';

interface PublishToastProps {
  isOpen: boolean;
  url: string | null;
  onClose: () => void;
}

export function PublishToast({ isOpen, url, onClose }: PublishToastProps) {
  const [copied, setCopied] = useState(false);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(onClose, 5000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  // Reset copied state
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  const handleCopy = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
    }
  }, [url]);

  if (!isOpen || !url) return null;

  return (
    <div className={styles.toast}>
      <span className={styles.text}>published</span>
      <button className={styles.copyBtn} onClick={handleCopy}>
        {copied ? 'copied!' : 'copy link'}
      </button>
    </div>
  );
}
