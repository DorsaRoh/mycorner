import { useState, useCallback, useRef, useEffect } from 'react';
import type { BackgroundConfig } from '@/shared/types';
import { uploadAsset, isAcceptedImageType } from '@/lib/upload';
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
const DEFAULT_IMAGE = {
  url: '',
  fit: 'cover' as const,
  position: 'center' as const,
  opacity: 1,
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
      const target = e.target as HTMLElement;
      
      // Don't close if clicking inside the panel
      if (panelRef.current?.contains(target)) return;
      
      // Don't close if clicking the background button itself (it toggles)
      const bgButton = document.querySelector('[data-background-btn]');
      if (bgButton?.contains(target)) return;
      
      // Don't close if clicking on a color picker (they open native dialogs)
      if (target.closest('input[type="color"]')) return;
      
      onClose();
    };

    // Add listener immediately on capture phase for reliability
    document.addEventListener('mousedown', handleClickOutside, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [onClose]);

  const setMode = useCallback((mode: 'solid' | 'gradient' | 'image') => {
    setLocalBackground(prev => {
      const next: BackgroundConfig = { ...prev, mode };
      if (mode === 'solid' && !next.solid) {
        next.solid = { color: DEFAULT_SOLID_COLOR };
      } else if (mode === 'gradient' && !next.gradient) {
        next.gradient = { ...DEFAULT_GRADIENT };
      } else if (mode === 'image' && !next.image) {
        next.image = { ...DEFAULT_IMAGE };
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

  // Image controls
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleImageUpload = useCallback(async (file: File) => {
    if (!isAcceptedImageType(file.type)) {
      setUploadError('Please upload a valid image (PNG, JPG, WebP, GIF)');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    const result = await uploadAsset(file);
    
    if (result.success) {
      setLocalBackground(prev => ({
        ...prev,
        mode: 'image',
        image: {
          ...DEFAULT_IMAGE,
          ...prev.image,
          url: result.data.url,
        },
      }));
    } else {
      setUploadError(result.error);
    }
    
    setIsUploading(false);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file);
    }
    // Reset the input so the same file can be selected again
    e.target.value = '';
  }, [handleImageUpload]);

  const setImageFit = useCallback((fit: 'cover' | 'contain' | 'fill' | 'tile') => {
    setLocalBackground(prev => ({
      ...prev,
      image: prev.image ? { ...prev.image, fit } : { ...DEFAULT_IMAGE, fit },
    }));
  }, []);

  const setImagePosition = useCallback((position: 'center' | 'top' | 'bottom' | 'left' | 'right') => {
    setLocalBackground(prev => ({
      ...prev,
      image: prev.image ? { ...prev.image, position } : { ...DEFAULT_IMAGE, position },
    }));
  }, []);

  const setImageOpacity = useCallback((opacity: number) => {
    setLocalBackground(prev => ({
      ...prev,
      image: prev.image ? { ...prev.image, opacity } : { ...DEFAULT_IMAGE, opacity },
    }));
  }, []);

  const removeImage = useCallback(() => {
    setLocalBackground(prev => ({
      ...prev,
      image: { ...DEFAULT_IMAGE },
    }));
  }, []);

  const resetAll = useCallback(() => {
    setLocalBackground({
      mode: 'solid',
      solid: { color: DEFAULT_SOLID_COLOR },
    });
    setUploadError(null);
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
        <button
          className={`${styles.modeButton} ${localBackground.mode === 'image' ? styles.modeActive : ''}`}
          onClick={() => setMode('image')}
        >
          Image
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

      {/* Image controls */}
      {localBackground.mode === 'image' && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
            onChange={handleFileChange}
            className={styles.hiddenInput}
          />

          {/* Upload area or image preview */}
          {!localBackground.image?.url ? (
            <button
              className={styles.uploadArea}
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <span className={styles.uploadingText}>Uploading...</span>
              ) : (
                <>
                  <span className={styles.uploadIcon}>📷</span>
                  <span className={styles.uploadText}>Click to upload image</span>
                </>
              )}
            </button>
          ) : (
            <div className={styles.imagePreviewContainer}>
              <div
                className={styles.imagePreview}
                style={{ backgroundImage: `url(${localBackground.image.url})` }}
              />
              <div className={styles.imageActions}>
                <button
                  className={styles.changeImageBtn}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? 'Uploading...' : 'Change'}
                </button>
                <button
                  className={styles.removeImageBtn}
                  onClick={removeImage}
                >
                  Remove
                </button>
              </div>
            </div>
          )}

          {uploadError && (
            <div className={styles.uploadError}>{uploadError}</div>
          )}

          {/* Image fit selector */}
          {localBackground.image?.url && (
            <>
              <div className={styles.gradientTypeRow}>
                <span className={styles.typeLabel}>Fit</span>
                <div className={styles.gradientTypeSelector}>
                  {(['cover', 'contain', 'fill', 'tile'] as const).map(fit => (
                    <button
                      key={fit}
                      className={`${styles.typeButton} ${localBackground.image?.fit === fit ? styles.typeActive : ''}`}
                      onClick={() => setImageFit(fit)}
                    >
                      {fit.charAt(0).toUpperCase() + fit.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Image position selector */}
              <div className={styles.gradientTypeRow}>
                <span className={styles.typeLabel}>Position</span>
                <div className={styles.gradientTypeSelector}>
                  {(['center', 'top', 'bottom'] as const).map(pos => (
                    <button
                      key={pos}
                      className={`${styles.typeButton} ${localBackground.image?.position === pos ? styles.typeActive : ''}`}
                      onClick={() => setImagePosition(pos)}
                    >
                      {pos.charAt(0).toUpperCase() + pos.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Image opacity slider */}
              <div className={styles.sliderRow}>
                <label className={styles.sliderLabel}>
                  Opacity
                  <span className={styles.sliderValue}>{Math.round((localBackground.image?.opacity ?? 1) * 100)}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={localBackground.image?.opacity ?? 1}
                  onChange={(e) => setImageOpacity(parseFloat(e.target.value))}
                  className={styles.slider}
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
