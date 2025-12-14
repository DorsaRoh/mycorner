import { useState, useRef, useEffect, useCallback } from 'react';
import type { BackgroundAudio } from '@/shared/types';
import styles from './BackgroundAudioPlayer.module.css';

interface BackgroundAudioPlayerProps {
  audio: BackgroundAudio;
}

const VOLUME_STORAGE_KEY = 'my-corner-audio-muted';

export function BackgroundAudioPlayer({ audio }: BackgroundAudioPlayerProps) {
  const [isMuted, setIsMuted] = useState(true); // Start muted until user interaction
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load mute preference from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (stored !== null) {
      setIsMuted(stored === 'true');
    }
  }, []);

  // Save mute preference to localStorage
  useEffect(() => {
    if (hasInteracted) {
      localStorage.setItem(VOLUME_STORAGE_KEY, String(isMuted));
    }
  }, [isMuted, hasInteracted]);

  // Initialize audio element
  useEffect(() => {
    if (!audio.enabled || !audio.url) return;

    const audioElement = new Audio(audio.url);
    audioElement.volume = audio.volume;
    audioElement.loop = audio.loop;
    audioElement.preload = 'auto';

    audioElement.onerror = () => {
      setAudioError(true);
      setIsPlaying(false);
    };

    audioElement.onended = () => {
      if (!audio.loop) {
        setIsPlaying(false);
      }
    };

    audioElement.onplay = () => setIsPlaying(true);
    audioElement.onpause = () => setIsPlaying(false);

    audioRef.current = audioElement;

    return () => {
      audioElement.pause();
      audioElement.src = '';
      audioRef.current = null;
    };
  }, [audio.url, audio.volume, audio.loop, audio.enabled]);

  // Handle user interaction to start playing
  useEffect(() => {
    if (!audio.enabled || !audio.url || hasInteracted) return;

    const handleFirstInteraction = () => {
      setHasInteracted(true);
      
      // Check stored preference - if user previously unmuted, start playing
      const storedMuted = localStorage.getItem(VOLUME_STORAGE_KEY);
      if (storedMuted === 'false' && audioRef.current) {
        audioRef.current.play().catch(() => {
          // Autoplay blocked, that's ok
        });
        setIsMuted(false);
      }
    };

    // Listen for any user interaction
    document.addEventListener('click', handleFirstInteraction, { once: true });
    document.addEventListener('touchstart', handleFirstInteraction, { once: true });
    document.addEventListener('keydown', handleFirstInteraction, { once: true });

    return () => {
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };
  }, [audio.enabled, audio.url, hasInteracted]);

  // Handle mute toggle
  const handleToggle = useCallback(() => {
    if (!audioRef.current) return;

    setHasInteracted(true);

    if (isMuted || !isPlaying) {
      // Unmute and play
      audioRef.current.play()
        .then(() => {
          setIsMuted(false);
          setAudioError(false);
        })
        .catch(() => {
          setAudioError(true);
        });
    } else {
      // Mute (pause)
      audioRef.current.pause();
      setIsMuted(true);
    }
  }, [isMuted, isPlaying]);

  // Don't render if audio is disabled or has no URL
  if (!audio.enabled || !audio.url) {
    return null;
  }

  // Don't show error state prominently - just show muted icon
  if (audioError) {
    return (
      <button
        className={`${styles.audioButton} ${styles.error}`}
        onClick={handleToggle}
        title="Audio unavailable"
      >
        <span className={styles.icon}>🔇</span>
      </button>
    );
  }

  return (
    <button
      className={`${styles.audioButton} ${isPlaying && !isMuted ? styles.playing : ''}`}
      onClick={handleToggle}
      title={isMuted ? 'Play background audio' : 'Mute background audio'}
    >
      <span className={styles.icon}>
        {isMuted || !isPlaying ? '🔇' : '🔊'}
      </span>
      {!hasInteracted && (
        <span className={styles.hint}>click for sound</span>
      )}
    </button>
  );
}
