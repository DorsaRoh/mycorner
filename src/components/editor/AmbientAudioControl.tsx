import { useState, useCallback, useRef, useEffect } from 'react';
import type { BackgroundAudio } from '@/shared/types';
import styles from './AmbientAudioControl.module.css';

interface AmbientAudioControlProps {
  backgroundAudio?: BackgroundAudio;
  onChange: (audio: BackgroundAudio | undefined) => void;
}

export function AmbientAudioControl({ backgroundAudio, onChange }: AmbientAudioControlProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [url, setUrl] = useState(backgroundAudio?.url || '');
  const [volume, setVolume] = useState(backgroundAudio?.volume ?? 0.5);
  const [isPlaying, setIsPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sync with prop changes
  useEffect(() => {
    if (backgroundAudio) {
      setUrl(backgroundAudio.url);
      setVolume(backgroundAudio.volume);
    }
  }, [backgroundAudio]);

  // Close on click outside
  useEffect(() => {
    if (!isExpanded) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
        // Save changes when closing
        if (url.trim()) {
          onChange({
            url: url.trim(),
            volume,
            loop: true,
            enabled: true,
          });
        }
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpanded, url, volume, onChange]);

  // Stop audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleToggle = useCallback(() => {
    if (!isExpanded) {
      setIsExpanded(true);
    } else {
      // Save and close
      if (url.trim()) {
        onChange({
          url: url.trim(),
          volume,
          loop: true,
          enabled: true,
        });
      }
      setIsExpanded(false);
    }
  }, [isExpanded, url, volume, onChange]);

  const handlePreview = useCallback(() => {
    if (!url.trim()) return;

    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    const audio = audioRef.current;
    audio.src = url;
    audio.volume = volume;
    audio.loop = true;

    audio.play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  }, [url, volume, isPlaying]);

  // Update volume in real-time
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const handleClear = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    setUrl('');
    setVolume(0.5);
    onChange(undefined);
    setIsExpanded(false);
  }, [onChange]);

  const hasAudio = Boolean(backgroundAudio?.url && backgroundAudio?.enabled);

  return (
    <div ref={containerRef} className={styles.container}>
      {/* Collapsed state - just a subtle icon */}
      <button
        className={`${styles.trigger} ${hasAudio ? styles.triggerActive : ''} ${isExpanded ? styles.triggerOpen : ''}`}
        onClick={handleToggle}
        title="Ambient sound"
      >
        <span className={styles.triggerIcon}>♪</span>
        {hasAudio && <span className={styles.triggerDot} />}
      </button>

      {/* Expanded state - inline controls */}
      {isExpanded && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>ambient</span>
            {url.trim() && (
              <button className={styles.clearBtn} onClick={handleClear}>
                ×
              </button>
            )}
          </div>

          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="paste audio url..."
            className={styles.urlInput}
            autoFocus
          />

          {url.trim() && (
            <>
              <div className={styles.volumeRow}>
                <span className={styles.volumeIcon}>◉</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className={styles.volumeSlider}
                />
              </div>

              <button
                className={`${styles.previewBtn} ${isPlaying ? styles.previewBtnActive : ''}`}
                onClick={handlePreview}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
            </>
          )}

          <p className={styles.hint}>
            plays for visitors
          </p>
        </div>
      )}
    </div>
  );
}
