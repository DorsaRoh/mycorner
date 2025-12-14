import { useRef, useEffect, useCallback, useState } from 'react';
import type { BlockType } from '@/shared/types';
import styles from './CreationPalette.module.css';

// Accepted image types for validation
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

interface CreationPaletteProps {
  x: number;
  y: number;
  onSelect: (type: BlockType, content?: string) => void;
  onClose: () => void;
}

interface PaletteOption {
  type: BlockType;
  icon: string;
  label: string;
  angle: number;
}

// 3 options arranged in a triangle around the cursor (equilateral triangle)
// Top, bottom-left, bottom-right positions
const OPTIONS: PaletteOption[] = [
  { type: 'TEXT', icon: '✎', label: 'text', angle: -90 },      // Top
  { type: 'IMAGE', icon: '◻', label: 'image', angle: 150 },    // Bottom-left
  { type: 'LINK', icon: '↗', label: 'link', angle: 30 },       // Bottom-right
];

const PALETTE_RADIUS = 70;

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

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      e.target.value = '';
      onClose();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      onSelect('IMAGE', reader.result as string);
    };
    reader.readAsDataURL(file);
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
