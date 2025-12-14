import { useState, useRef, useEffect, useCallback } from 'react';
import type { BackgroundAudio } from '@/shared/types';
import styles from './SoundSettingsModal.module.css';

interface SoundSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  backgroundAudio?: BackgroundAudio;
  onSave: (audio: BackgroundAudio | undefined) => void;
}

export function SoundSettingsModal({
  isOpen,
  onClose,
  backgroundAudio,
  onSave,
}: SoundSettingsModalProps) {
  const [url, setUrl] = useState(backgroundAudio?.url || '');
  const [volume, setVolume] = useState(backgroundAudio?.volume ?? 0.5);
  const [loop, setLoop] = useState(backgroundAudio?.loop ?? true);
  const [enabled, setEnabled] = useState(backgroundAudio?.enabled ?? false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Update local state when prop changes
  useEffect(() => {
    if (backgroundAudio) {
      setUrl(backgroundAudio.url);
      setVolume(backgroundAudio.volume);
      setLoop(backgroundAudio.loop);
      setEnabled(backgroundAudio.enabled);
    } else {
      setUrl('');
      setVolume(0.5);
      setLoop(true);
      setEnabled(false);
    }
  }, [backgroundAudio]);

  // Clean up audio on unmount or close
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Stop audio when modal closes
  useEffect(() => {
    if (!isOpen && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [isOpen]);

  const handlePreview = useCallback(() => {
    if (!url.trim()) {
      setAudioError('Please enter an audio URL');
      return;
    }

    setAudioError(null);

    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    // Create or reuse audio element
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    const audio = audioRef.current;
    audio.src = url;
    audio.volume = volume;
    audio.loop = loop;

    audio.onerror = () => {
      setAudioError('Could not load audio from this URL');
      setIsPlaying(false);
    };

    audio.onended = () => {
      if (!loop) {
        setIsPlaying(false);
      }
    };

    audio.play()
      .then(() => {
        setIsPlaying(true);
        setAudioError(null);
      })
      .catch(() => {
        setAudioError('Could not play audio');
        setIsPlaying(false);
      });
  }, [url, volume, loop, isPlaying]);

  // Update audio volume in real-time
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const handleSave = useCallback(() => {
    // Stop preview audio
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }

    if (enabled && url.trim()) {
      onSave({
        url: url.trim(),
        volume,
        loop,
        enabled: true,
      });
    } else if (!enabled || !url.trim()) {
      onSave(url.trim() ? { url: url.trim(), volume, loop, enabled: false } : undefined);
    }
    onClose();
  }, [url, volume, loop, enabled, onSave, onClose]);

  const handleClear = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    setUrl('');
    setVolume(0.5);
    setLoop(true);
    setEnabled(false);
    setAudioError(null);
    onSave(undefined);
    onClose();
  }, [onSave, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Background Sound</h2>
        <p className={styles.subtitle}>
          Add ambient audio to your page. Visitors can mute it anytime.
        </p>

        <div className={styles.field}>
          <label className={styles.label}>Audio URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setAudioError(null);
            }}
            placeholder="https://example.com/audio.mp3"
            className={styles.input}
          />
          <span className={styles.hint}>
            MP3, WAV, or OGG file URL
          </span>
        </div>

        {audioError && (
          <div className={styles.error}>
            {audioError}
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label}>Volume</label>
          <div className={styles.volumeRow}>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className={styles.volumeSlider}
            />
            <span className={styles.volumeValue}>{Math.round(volume * 100)}%</span>
          </div>
        </div>

        <div className={styles.toggleRow}>
          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
              className={styles.checkbox}
            />
            <span>Loop audio</span>
          </label>
        </div>

        <div className={styles.toggleRow}>
          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className={styles.checkbox}
            />
            <span>Enable for visitors</span>
          </label>
        </div>

        <div className={styles.previewRow}>
          <button
            type="button"
            className={styles.previewBtn}
            onClick={handlePreview}
            disabled={!url.trim()}
          >
            {isPlaying ? '⏸ Pause' : '▶ Preview'}
          </button>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.clearBtn}
            onClick={handleClear}
          >
            Clear
          </button>
          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
