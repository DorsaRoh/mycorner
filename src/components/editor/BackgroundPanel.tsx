import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { BackgroundConfig } from '@/shared/types';
import styles from './BackgroundPanel.module.css';

interface BackgroundPanelProps {
  background?: BackgroundConfig;
  onChange: (background: BackgroundConfig) => void;
  onClose: () => void;
}

interface SliderConfig {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  neutral: number;
  unit?: string;
}

const SOLID_OPACITY_SLIDER: SliderConfig = {
  key: 'solid.opacity',
  label: 'Opacity',
  min: 0,
  max: 1,
  step: 0.01,
  neutral: 1,
};

const GRADIENT_OPACITY_SLIDER: SliderConfig = {
  key: 'gradient.opacity',
  label: 'Opacity',
  min: 0,
  max: 1,
  step: 0.01,
  neutral: 1,
};

const GRADIENT_ANGLE_SLIDER: SliderConfig = {
  key: 'gradient.angle',
  label: 'Angle',
  min: 0,
  max: 360,
  step: 1,
  neutral: 45,
  unit: '°',
};

const TEXTURE_INTENSITY_SLIDER: SliderConfig = {
  key: 'texture.intensity',
  label: 'Intensity',
  min: 0,
  max: 0.2,
  step: 0.005,
  neutral: 0.05,
};

const TEXTURE_SCALE_SLIDER: SliderConfig = {
  key: 'texture.scale',
  label: 'Scale',
  min: 0.5,
  max: 2,
  step: 0.1,
  neutral: 1,
  unit: 'x',
};

const TEXTURE_OPACITY_SLIDER: SliderConfig = {
  key: 'texture.opacity',
  label: 'Opacity',
  min: 0,
  max: 1,
  step: 0.01,
  neutral: 0.3,
};

const VIGNETTE_SLIDER: SliderConfig = {
  key: 'lighting.vignette',
  label: 'Vignette',
  min: 0,
  max: 0.3,
  step: 0.01,
  neutral: 0,
};

const BRIGHTNESS_SLIDER: SliderConfig = {
  key: 'lighting.brightness',
  label: 'Brightness',
  min: -0.1,
  max: 0.1,
  step: 0.01,
  neutral: 0,
  unit: '%',
};

const CONTRAST_SLIDER: SliderConfig = {
  key: 'lighting.contrast',
  label: 'Contrast',
  min: -0.1,
  max: 0.1,
  step: 0.01,
  neutral: 0,
  unit: '%',
};

// Check if hint has been shown before
const HINT_SHOWN_KEY = 'background-panel-hint-shown';
function hasHintBeenShown(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(HINT_SHOWN_KEY) === 'true';
}
function markHintAsShown(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HINT_SHOWN_KEY, 'true');
}

export function BackgroundPanel({ background, onChange, onClose }: BackgroundPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [localBackground, setLocalBackground] = useState<BackgroundConfig>(() => ({
    mode: 'solid',
    solid: { color: '#faf9f6', opacity: 1 },
    ...background,
  }));

  // Track which bands are expanded (color/gradient collapsed by default, others expanded)
  const [expandedBands, setExpandedBands] = useState<Set<string>>(new Set(['texture', 'lighting', 'motion']));

  // Track if user is dragging any slider
  const [isDragging, setIsDragging] = useState(false);

  // Hint visibility
  const [showHint, setShowHint] = useState(() => !hasHintBeenShown());

  // Handle click outside to close panel
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Hide hint after first interaction
  const handleFirstInteraction = useCallback(() => {
    if (showHint) {
      setShowHint(false);
      markHintAsShown();
    }
  }, [showHint]);

  const toggleBand = useCallback((band: string) => {
    handleFirstInteraction();
    setExpandedBands(prev => {
      const next = new Set(prev);
      if (next.has(band)) {
        next.delete(band);
      } else {
        next.add(band);
      }
      return next;
    });
  }, [handleFirstInteraction]);

  // Update background value
  const updateBackground = useCallback((key: string, value: number | string | boolean) => {
    handleFirstInteraction();
    setLocalBackground(prev => {
      const next = { ...prev };

      if (key.includes('.')) {
        const [section, property] = key.split('.');
        if (section === 'solid' && next.solid) {
          (next.solid as any)[property] = value;
        } else if (section === 'gradient' && next.gradient) {
          (next.gradient as any)[property] = value;
        } else if (section === 'texture' && next.texture) {
          (next.texture as any)[property] = value;
        } else if (section === 'lighting' && next.lighting) {
          (next.lighting as any)[property] = value;
        } else if (section === 'motion' && next.motion) {
          (next.motion as any)[property] = value;
        }
      } else if (key === 'mode') {
        next.mode = value as 'solid' | 'gradient';
        // Initialize sections when switching modes
        if (value === 'solid' && !next.solid) {
          next.solid = { color: '#faf9f6', opacity: 1 };
        } else if (value === 'gradient' && !next.gradient) {
          next.gradient = {
            type: 'linear',
            colorA: '#ffffff',
            colorB: '#000000',
            angle: 45,
            opacity: 1,
          };
        }
      }

      requestAnimationFrame(() => onChange(next));
      return next;
    });
  }, [onChange, handleFirstInteraction]);

  // Reset a section
  const resetSection = useCallback((section: string, defaults: Record<string, any>) => {
    setLocalBackground(prev => {
      const next = { ...prev };

      if (section === 'solid') {
        next.solid = { color: '#faf9f6', opacity: 1 };
      } else if (section === 'gradient') {
        next.gradient = {
          type: 'linear',
          colorA: '#ffffff',
          colorB: '#000000',
          angle: 45,
          opacity: 1,
        };
      } else if (section === 'texture') {
        next.texture = undefined;
      } else if (section === 'lighting') {
        next.lighting = undefined;
      } else if (section === 'motion') {
        next.motion = undefined;
      }

      requestAnimationFrame(() => onChange(next));
      return next;
    });
  }, [onChange]);

  // Reset all background settings
  const resetAll = useCallback(() => {
    const reset: BackgroundConfig = {
      mode: 'solid',
      solid: { color: '#faf9f6', opacity: 1 },
    };
    setLocalBackground(reset);
    onChange(reset);
  }, [onChange]);

  // Check if any settings are active in a section
  const sectionHasChanges = useCallback((section: string) => {
    if (section === 'solid') {
      return localBackground.solid && (
        localBackground.solid.color !== '#faf9f6' ||
        localBackground.solid.opacity !== 1
      );
    }
    if (section === 'gradient') {
      return localBackground.gradient && (
        localBackground.gradient.type !== 'linear' ||
        localBackground.gradient.colorA !== '#ffffff' ||
        localBackground.gradient.colorB !== '#000000' ||
        localBackground.gradient.angle !== 45 ||
        localBackground.gradient.opacity !== 1
      );
    }
    if (section === 'texture') {
      return !!localBackground.texture;
    }
    if (section === 'lighting') {
      return !!localBackground.lighting;
    }
    if (section === 'motion') {
      return !!localBackground.motion?.enabled;
    }
    return false;
  }, [localBackground]);

  const hasAnyChanges = useMemo(() => {
    return sectionHasChanges('solid') ||
           sectionHasChanges('gradient') ||
           sectionHasChanges('texture') ||
           sectionHasChanges('lighting') ||
           sectionHasChanges('motion');
  }, [sectionHasChanges]);

  // Calculate fill percentage for slider track visualization
  const getSliderFill = useCallback((config: SliderConfig, value: number) => {
    const range = config.max - config.min;
    const neutralPercent = ((config.neutral - config.min) / range) * 100;
    const valuePercent = ((value - config.min) / range) * 100;

    if (value >= config.neutral) {
      return {
        left: `${neutralPercent}%`,
        width: `${valuePercent - neutralPercent}%`,
      };
    } else {
      return {
        left: `${valuePercent}%`,
        width: `${neutralPercent - valuePercent}%`,
      };
    }
  }, []);

  const renderSlider = useCallback((config: SliderConfig, value: number, onValueChange: (value: number) => void) => {
    const isActive = value !== config.neutral;
    const fill = getSliderFill(config, value);

    return (
      <div key={config.key} className={styles.sliderRow}>
        <label className={`${styles.sliderLabel} ${isActive ? styles.active : ''} ${isDragging ? styles.dragging : ''}`}>
          {config.label}
          <span className={styles.sliderValue}>
            {config.unit ? `${value}${config.unit}` : value.toFixed(config.step < 1 ? 2 : 0)}
          </span>
        </label>
        <div className={styles.sliderTrack}>
          <div
            className={`${styles.sliderFill} ${isActive ? styles.fillActive : ''}`}
            style={fill}
          />
          <input
            type="range"
            min={config.min}
            max={config.max}
            step={config.step}
            value={value}
            onChange={(e) => onValueChange(parseFloat(e.target.value))}
            onMouseDown={() => { setIsDragging(true); handleFirstInteraction(); }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            className={`${styles.slider} ${isActive ? styles.sliderActive : ''}`}
          />
        </div>
      </div>
    );
  }, [isDragging, getSliderFill, handleFirstInteraction]);

  const renderBand = useCallback((
    name: string,
    title: string,
    content: React.ReactNode,
    extraContent?: React.ReactNode
  ) => {
    const isExpanded = expandedBands.has(name);
    const hasChanges = sectionHasChanges(name);

    return (
      <div className={`${styles.band} ${isExpanded ? styles.bandExpanded : ''}`}>
        <button
          className={styles.bandHeader}
          onClick={() => toggleBand(name)}
        >
          <span className={`${styles.bandArrow} ${isExpanded ? styles.bandArrowExpanded : ''}`}>
            ›
          </span>
          <span className={`${styles.bandTitle} ${hasChanges ? styles.bandTitleActive : ''}`}>
            {title}
          </span>
          {hasChanges && (
            <button
              className={styles.bandReset}
              onClick={(e) => {
                e.stopPropagation();
                resetSection(name, {});
              }}
              title={`Reset ${title.toLowerCase()}`}
            >
              ↺
            </button>
          )}
        </button>

        <div className={styles.bandContent}>
          {content}
          {isExpanded && extraContent}
        </div>
      </div>
    );
  }, [expandedBands, sectionHasChanges, toggleBand, resetSection]);

  return (
    <div
      ref={panelRef}
      className={styles.panel}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Caret pointing to block */}
      <div className={styles.caret} />

      <div className={styles.header}>
        <span className={styles.title}>Background</span>
        {hasAnyChanges && (
          <button
            className={styles.resetAllBtn}
            onClick={resetAll}
            title="Reset all background settings"
          >
            ↺
          </button>
        )}
      </div>

      {/* Hint for first-time users */}
      {showHint && (
        <div className={styles.hint}>
          subtle backgrounds enhance without distracting
        </div>
      )}

      <div className={styles.bands}>
        {/* Color/Gradient section */}
        {renderBand(
          'color',
          localBackground.mode === 'solid' ? 'Solid Color' : 'Gradient',
          <>
            {/* Mode selector */}
            <div className={styles.modeSelector}>
              <button
                className={`${styles.modeButton} ${localBackground.mode === 'solid' ? styles.modeActive : ''}`}
                onClick={() => updateBackground('mode', 'solid')}
              >
                Solid
              </button>
              <button
                className={`${styles.modeButton} ${localBackground.mode === 'gradient' ? styles.modeActive : ''}`}
                onClick={() => updateBackground('mode', 'gradient')}
              >
                Gradient
              </button>
            </div>

            {/* Solid color controls */}
            {localBackground.mode === 'solid' && localBackground.solid && (
              <>
                <div className={styles.colorPickerRow}>
                  <label className={styles.colorLabel}>Color</label>
                  <input
                    type="color"
                    value={localBackground.solid.color}
                    onChange={(e) => updateBackground('solid.color', e.target.value)}
                    className={styles.colorInput}
                  />
                </div>
                {renderSlider(
                  SOLID_OPACITY_SLIDER,
                  localBackground.solid.opacity,
                  (value) => updateBackground('solid.opacity', value)
                )}
              </>
            )}

            {/* Gradient controls */}
            {localBackground.mode === 'gradient' && localBackground.gradient && (
              <>
                <div className={styles.gradientTypeSelector}>
                  <button
                    className={`${styles.typeButton} ${localBackground.gradient.type === 'linear' ? styles.typeActive : ''}`}
                    onClick={() => updateBackground('gradient.type', 'linear')}
                  >
                    Linear
                  </button>
                  <button
                    className={`${styles.typeButton} ${localBackground.gradient.type === 'radial' ? styles.typeActive : ''}`}
                    onClick={() => updateBackground('gradient.type', 'radial')}
                  >
                    Radial
                  </button>
                </div>

                <div className={styles.colorPickerRow}>
                  <label className={styles.colorLabel}>Color A</label>
                  <input
                    type="color"
                    value={localBackground.gradient.colorA}
                    onChange={(e) => updateBackground('gradient.colorA', e.target.value)}
                    className={styles.colorInput}
                  />
                </div>

                <div className={styles.colorPickerRow}>
                  <label className={styles.colorLabel}>Color B</label>
                  <input
                    type="color"
                    value={localBackground.gradient.colorB}
                    onChange={(e) => updateBackground('gradient.colorB', e.target.value)}
                    className={styles.colorInput}
                  />
                </div>

                {localBackground.gradient.type === 'linear' && renderSlider(
                  GRADIENT_ANGLE_SLIDER,
                  localBackground.gradient.angle,
                  (value) => updateBackground('gradient.angle', value)
                )}

                {renderSlider(
                  GRADIENT_OPACITY_SLIDER,
                  localBackground.gradient.opacity,
                  (value) => updateBackground('gradient.opacity', value)
                )}
              </>
            )}
          </>
        )}

        {/* Texture section */}
        {renderBand(
          'texture',
          'Texture',
          <>
            <div className={styles.textureSelector}>
              {(['none', 'noise', 'paper', 'grain'] as const).map((type) => (
                <button
                  key={type}
                  className={`${styles.textureButton} ${localBackground.texture?.type === type ? styles.textureActive : ''}`}
                  onClick={() => {
                    if (type === 'none') {
                      setLocalBackground(prev => ({ ...prev, texture: undefined }));
                      onChange({ ...localBackground, texture: undefined });
                    } else {
                      const newTexture = localBackground.texture || {
                        type: type as any,
                        intensity: TEXTURE_INTENSITY_SLIDER.neutral,
                        scale: TEXTURE_SCALE_SLIDER.neutral,
                        opacity: TEXTURE_OPACITY_SLIDER.neutral,
                      };
                      newTexture.type = type as any;
                      setLocalBackground(prev => ({ ...prev, texture: newTexture }));
                      onChange({ ...localBackground, texture: newTexture });
                    }
                  }}
                >
                  {type === 'none' ? 'None' : type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </>,
          localBackground.texture && (
            <>
              {renderSlider(
                TEXTURE_INTENSITY_SLIDER,
                localBackground.texture.intensity,
                (value) => updateBackground('texture.intensity', value)
              )}
              {renderSlider(
                TEXTURE_SCALE_SLIDER,
                localBackground.texture.scale,
                (value) => updateBackground('texture.scale', value)
              )}
              {renderSlider(
                TEXTURE_OPACITY_SLIDER,
                localBackground.texture.opacity,
                (value) => updateBackground('texture.opacity', value)
              )}
            </>
          )
        )}

        {/* Lighting section */}
        {renderBand(
          'lighting',
          'Lighting',
          <>
            <div className={styles.lightingToggles}>
              <button
                className={`${styles.lightingToggle} ${localBackground.lighting ? styles.lightingActive : ''}`}
                onClick={() => {
                  if (localBackground.lighting) {
                    setLocalBackground(prev => ({ ...prev, lighting: undefined }));
                    onChange({ ...localBackground, lighting: undefined });
                  } else {
                    const newLighting = {
                      vignette: VIGNETTE_SLIDER.neutral,
                      brightness: BRIGHTNESS_SLIDER.neutral,
                      contrast: CONTRAST_SLIDER.neutral,
                    };
                    setLocalBackground(prev => ({ ...prev, lighting: newLighting }));
                    onChange({ ...localBackground, lighting: newLighting });
                  }
                }}
              >
                Enable Lighting
              </button>
            </div>
          </>,
          localBackground.lighting && (
            <>
              {renderSlider(
                VIGNETTE_SLIDER,
                localBackground.lighting.vignette,
                (value) => updateBackground('lighting.vignette', value)
              )}
              {renderSlider(
                BRIGHTNESS_SLIDER,
                localBackground.lighting.brightness,
                (value) => updateBackground('lighting.brightness', value)
              )}
              {renderSlider(
                CONTRAST_SLIDER,
                localBackground.lighting.contrast,
                (value) => updateBackground('lighting.contrast', value)
              )}
            </>
          )
        )}

        {/* Motion section */}
        {renderBand(
          'motion',
          'Motion',
          <>
            <div className={styles.motionControls}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={localBackground.motion?.enabled || false}
                  onChange={(e) => {
                    if (e.target.checked) {
                      updateBackground('motion.enabled', true);
                      updateBackground('motion.speed', 'slow');
                    } else {
                      updateBackground('motion.enabled', false);
                    }
                  }}
                  className={styles.checkbox}
                />
                Ambient drift
              </label>

              {localBackground.motion?.enabled && (
                <div className={styles.speedSelector}>
                  {(['slow', 'slower', 'slowest'] as const).map((speed) => (
                    <button
                      key={speed}
                      className={`${styles.speedButton} ${localBackground.motion?.speed === speed ? styles.speedActive : ''}`}
                      onClick={() => updateBackground('motion.speed', speed)}
                    >
                      {speed}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}