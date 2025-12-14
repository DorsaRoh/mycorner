import { useState, useCallback, useRef, useEffect } from 'react';
import type { BackgroundConfig } from '@/shared/types';
import styles from './BackgroundPanel.module.css';

interface BackgroundPanelProps {
  background?: BackgroundConfig;
  onChange: (background: BackgroundConfig) => void;
  onClose: () => void;
}

const DEFAULT_SOLID_COLOR = '#faf9f6';
const DEFAULT_GRADIENT = {
  type: 'linear' as const,
  colorA: '#ffffff',
  colorB: '#000000',
  angle: 45,
};

export function BackgroundPanel({ background, onChange, onClose }: BackgroundPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [localBackground, setLocalBackground] = useState<BackgroundConfig>(() => ({
    mode: 'solid',
    solid: { color: DEFAULT_SOLID_COLOR },
    ...background,
  }));

  // Track initial mount to avoid triggering onChange on first render
  const isInitialMount = useRef(true);

  // Sync local background changes to parent for real-time preview
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    onChange(localBackground);
  }, [localBackground, onChange]);

  // Handle click outside to close panel
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      
      if (panelRef.current?.contains(target)) return;
      
      const bgButton = document.querySelector('[data-background-btn]');
      if (bgButton?.contains(target)) return;
      
      onClose();
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const setMode = useCallback((mode: 'solid' | 'gradient') => {
    setLocalBackground(prev => {
      const next: BackgroundConfig = { ...prev, mode };
      if (mode === 'solid' && !next.solid) {
        next.solid = { color: DEFAULT_SOLID_COLOR };
      } else if (mode === 'gradient' && !next.gradient) {
        next.gradient = { ...DEFAULT_GRADIENT };
      }
      return next;
    });
  }, []);

  const setSolidColor = useCallback((color: string) => {
    setLocalBackground(prev => ({
      ...prev,
      solid: { color },
    }));
  }, []);

  const setGradientType = useCallback((type: 'linear' | 'radial') => {
    setLocalBackground(prev => ({
      ...prev,
      gradient: prev.gradient ? { ...prev.gradient, type } : { ...DEFAULT_GRADIENT, type },
    }));
  }, []);

  const setGradientColor = useCallback((key: 'colorA' | 'colorB', color: string) => {
    setLocalBackground(prev => ({
      ...prev,
      gradient: prev.gradient ? { ...prev.gradient, [key]: color } : { ...DEFAULT_GRADIENT, [key]: color },
    }));
  }, []);

  const setGradientAngle = useCallback((angle: number) => {
    setLocalBackground(prev => ({
      ...prev,
      gradient: prev.gradient ? { ...prev.gradient, angle } : { ...DEFAULT_GRADIENT, angle },
    }));
  }, []);

  const resetAll = useCallback(() => {
    setLocalBackground({
      mode: 'solid',
      solid: { color: DEFAULT_SOLID_COLOR },
    });
  }, []);

  const hasChanges = localBackground.mode !== 'solid' || 
    localBackground.solid?.color !== DEFAULT_SOLID_COLOR;

  return (
    <div
      ref={panelRef}
      className={styles.panel}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className={styles.caret} />

      <div className={styles.header}>
        <span className={styles.title}>Background</span>
        {hasChanges && (
          <button
            className={styles.resetAllBtn}
            onClick={resetAll}
            title="Reset background"
          >
            ↺
          </button>
        )}
      </div>

      {/* Mode selector */}
      <div className={styles.modeSelector}>
        <button
          className={`${styles.modeButton} ${localBackground.mode === 'solid' ? styles.modeActive : ''}`}
          onClick={() => setMode('solid')}
        >
          Solid
        </button>
        <button
          className={`${styles.modeButton} ${localBackground.mode === 'gradient' ? styles.modeActive : ''}`}
          onClick={() => setMode('gradient')}
        >
          Gradient
        </button>
      </div>

      {/* Solid color controls */}
      {localBackground.mode === 'solid' && (
        <div className={styles.colorPickerRow}>
          <label className={styles.colorLabel}>Color</label>
          <input
            type="color"
            value={localBackground.solid?.color || DEFAULT_SOLID_COLOR}
            onChange={(e) => setSolidColor(e.target.value)}
            className={styles.colorInput}
          />
        </div>
      )}

      {/* Gradient controls */}
      {localBackground.mode === 'gradient' && localBackground.gradient && (
        <>
          <div className={styles.gradientTypeRow}>
            <span className={styles.typeLabel}>Type</span>
            <div className={styles.gradientTypeSelector}>
              <button
                className={`${styles.typeButton} ${localBackground.gradient.type === 'linear' ? styles.typeActive : ''}`}
                onClick={() => setGradientType('linear')}
              >
                Linear
              </button>
              <button
                className={`${styles.typeButton} ${localBackground.gradient.type === 'radial' ? styles.typeActive : ''}`}
                onClick={() => setGradientType('radial')}
              >
                Radial
              </button>
            </div>
          </div>

          <div className={styles.colorPickerRow}>
            <label className={styles.colorLabel}>Color A</label>
            <input
              type="color"
              value={localBackground.gradient.colorA}
              onChange={(e) => setGradientColor('colorA', e.target.value)}
              className={styles.colorInput}
            />
          </div>

          <div className={styles.colorPickerRow}>
            <label className={styles.colorLabel}>Color B</label>
            <input
              type="color"
              value={localBackground.gradient.colorB}
              onChange={(e) => setGradientColor('colorB', e.target.value)}
              className={styles.colorInput}
            />
          </div>

          {localBackground.gradient.type === 'linear' && (
            <div className={styles.sliderRow}>
              <label className={styles.sliderLabel}>
                Angle
                <span className={styles.sliderValue}>{localBackground.gradient.angle}°</span>
              </label>
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                value={localBackground.gradient.angle}
                onChange={(e) => setGradientAngle(parseInt(e.target.value))}
                className={styles.slider}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
