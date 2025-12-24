import { useRef, useEffect, useCallback, useState } from 'react';
import type { BlockType } from '@/shared/types';
import { isAcceptedImageType } from '@/lib/upload';
import styles from './CreationPalette.module.css';

interface CreationPaletteProps {
  x: number;
  y: number;
  onSelect: (type: BlockType, content?: string, file?: File) => void;
  onClose: () => void;
}

interface PaletteOption {
  type: BlockType;
  icon: React.ReactNode;
  label: string;
  angle: number;
}

// SVG icons for each block type
const TextIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7V4h16v3" />
    <path d="M9 20h6" />
    <path d="M12 4v16" />
  </svg>
);

const ImageIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
);

const LinkIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

// 3 options arranged around the cursor
const OPTIONS: PaletteOption[] = [
  { type: 'TEXT', icon: <TextIcon />, label: 'text', angle: 270 },      // Top
  { type: 'IMAGE', icon: <ImageIcon />, label: 'image', angle: 0 },     // Right
  { type: 'LINK', icon: <LinkIcon />, label: 'link', angle: 180 },      // Left
];

const PALETTE_RADIUS = 50;

export function CreationPalette({ x, y, onSelect, onClose }: CreationPaletteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isFileDialogOpen, setIsFileDialogOpen] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fade in after mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // Handle mouse leaving the palette area - start fade out
  const handleMouseLeave = useCallback(() => {
    // Don't close if file dialog is open
    if (isFileDialogOpen) return;
    
    hoverTimeoutRef.current = setTimeout(() => {
      setIsFadingOut(true);
      closeTimeoutRef.current = setTimeout(() => {
        onClose();
      }, 120);
    }, 200); // Small delay before starting fade
  }, [onClose, isFileDialogOpen]);

  // Cancel fade out if mouse returns
  const handleMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsFadingOut(false);
  }, []);

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const handleOptionClick = useCallback((type: BlockType) => {
    if (type === 'IMAGE') {
      // Mark file dialog as open to prevent palette from closing
      setIsFileDialogOpen(true);
      // Open file picker for images
      fileInputRef.current?.click();
    } else {
      onSelect(type);
    }
  }, [onSelect]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setIsFileDialogOpen(false);
    const file = e.target.files?.[0];
    if (!file) {
      // User cancelled - close the palette
      onClose();
      return;
    }

    if (!isAcceptedImageType(file.type)) {
      e.target.value = '';
      onClose();
      return;
    }

    // Pass file to parent for immediate feedback + async upload
    // Parent will create block with loading state and handle upload
    onSelect('IMAGE', '__loading__', file);
    e.target.value = '';
  }, [onSelect, onClose]);
  
  // Handle file dialog cancel (focus returns to window)
  useEffect(() => {
    if (!isFileDialogOpen) return;
    
    const handleFocus = () => {
      // Small delay to allow the file input change event to fire first
      setTimeout(() => {
        if (isFileDialogOpen && (!fileInputRef.current?.files?.length)) {
          setIsFileDialogOpen(false);
        }
      }, 100);
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isFileDialogOpen]);

  // Calculate position for each option in a semi-radial layout
  const getOptionPosition = (angle: number) => {
    const rad = (angle * Math.PI) / 180;
    return {
      x: Math.cos(rad) * PALETTE_RADIUS,
      y: Math.sin(rad) * PALETTE_RADIUS,
    };
  };

  // Keep palette within viewport bounds
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1000;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  
  const adjustedX = Math.min(Math.max(x, 100), viewportWidth - 100);
  const adjustedY = Math.min(Math.max(y, 100), viewportHeight - 100);

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${isVisible ? styles.visible : ''} ${isFadingOut ? styles.fadeOut : ''}`}
      style={{
        left: adjustedX,
        top: adjustedY,
      }}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
    >
      {/* Hidden file input for images */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.gif"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Center indicator - subtle dot */}
      <div className={styles.centerDot} />

      {/* Radial options */}
      {OPTIONS.map((option, index) => {
        const pos = getOptionPosition(option.angle);
        return (
          <button
            key={option.type}
            className={styles.option}
            style={{
              '--offset-x': `${pos.x}px`,
              '--offset-y': `${pos.y}px`,
              '--delay': `${index * 25}ms`,
            } as React.CSSProperties}
            onClick={() => handleOptionClick(option.type)}
          >
            <span className={styles.optionIcon}>{option.icon}</span>
            <span className={styles.optionLabel}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
