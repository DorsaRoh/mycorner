import { useState, useCallback, useEffect } from 'react';
import styles from './PublishToast.module.css';

interface PublishToastProps {
  isOpen: boolean;
  url: string | null;
  onClose: () => void;
}

export function PublishToast({ isOpen, url, onClose }: PublishToastProps) {
  const [copied, setCopied] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Trigger confetti effect when toast opens
  useEffect(() => {
    if (isOpen) {
      setShowConfetti(true);
      // Reset confetti after animation completes
      const timer = setTimeout(() => setShowConfetti(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

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

  // Extract display URL (without protocol)
  const displayUrl = url?.replace(/^https?:\/\//, '') || '';

  if (!isOpen || !url) return null;

  return (
    <>
      {/* Confetti particles */}
      {showConfetti && (
        <div className={styles.confettiContainer}>
          {[...Array(20)].map((_, i) => (
            <div key={i} className={styles.confetti} style={{
              '--delay': `${Math.random() * 0.5}s`,
              '--x': `${Math.random() * 200 - 100}px`,
              '--rotation': `${Math.random() * 720 - 360}deg`,
              '--hue': `${Math.random() * 360}`,
            } as React.CSSProperties} />
          ))}
        </div>
      )}
      
      <div className={styles.toast}>
        <div className={styles.successIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        
        <div className={styles.content}>
          <span className={styles.title}>Your corner is live!</span>
          <a href={url} target="_blank" rel="noopener noreferrer" className={styles.urlLink}>
            {displayUrl}
          </a>
        </div>
        
        <div className={styles.actions}>
          <a href={url} target="_blank" rel="noopener noreferrer" className={styles.visitBtn}>
            Visit
          </a>
          <button className={styles.copyBtn} onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </>
  );
}
