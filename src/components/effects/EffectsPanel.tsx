import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { BlockEffects, GradientOverlay } from '@/shared/types';
import { DEFAULT_EFFECTS } from '@/shared/types';
import styles from './EffectsPanel.module.css';

interface EffectsPanelProps {
  effects?: BlockEffects;
  onChange: (effects: BlockEffects) => void;
  onClose: () => void;
}

interface SliderConfig {
  key: keyof BlockEffects;
  label: string;
  min: number;
  max: number;
  step: number;
  neutral: number;
  isPrimary?: boolean; // Show when band is collapsed
}

const LOOK_SLIDERS: SliderConfig[] = [
  { key: 'brightness', label: 'Brightness', min: -1, max: 1, step: 0.05, neutral: 0, isPrimary: true },
  { key: 'contrast', label: 'Contrast', min: -1, max: 1, step: 0.05, neutral: 0 },
  { key: 'saturation', label: 'Saturation', min: -1, max: 1, step: 0.05, neutral: 0 },
  { key: 'hueShift', label: 'Hue', min: -180, max: 180, step: 5, neutral: 0 },
];

const TEXTURE_SLIDERS: SliderConfig[] = [
  { key: 'pixelate', label: 'Pixelation', min: 0, max: 1, step: 0.05, neutral: 0, isPrimary: true },
  { key: 'dither', label: 'Dither', min: 0, max: 1, step: 0.05, neutral: 0 },
  { key: 'noise', label: 'Noise', min: 0, max: 1, step: 0.05, neutral: 0 },
  { key: 'grainSize', label: 'Grain Size', min: 0, max: 1, step: 0.05, neutral: 0.5 },
];

const ATMOSPHERE_SLIDERS: SliderConfig[] = [
  { key: 'blur', label: 'Blur', min: 0, max: 1, step: 0.05, neutral: 0, isPrimary: true },
];

type BandName = 'look' | 'texture' | 'atmosphere';

export function EffectsPanel({ effects, onChange, onClose }: EffectsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [localEffects, setLocalEffects] = useState<BlockEffects>(() => ({
    ...DEFAULT_EFFECTS,
    ...effects,
    gradientOverlay: {
      ...DEFAULT_EFFECTS.gradientOverlay!,
      ...effects?.gradientOverlay,
    },
  }));
  
  // Track which bands are expanded (all collapsed by default)
  const [expandedBands, setExpandedBands] = useState<Set<BandName>>(new Set());
  
  // Track if user is dragging any slider
  const [isDragging, setIsDragging] = useState(false);

  // Handle click outside to close panel
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    // Delay adding listener to prevent immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const toggleBand = useCallback((band: BandName) => {
    setExpandedBands(prev => {
      const next = new Set(prev);
      if (next.has(band)) {
        next.delete(band);
      } else {
        next.add(band);
      }
      return next;
    });
  }, []);

  // Throttled update to parent
  const updateEffect = useCallback((key: keyof BlockEffects, value: number | GradientOverlay) => {
    setLocalEffects(prev => {
      const next = { ...prev, [key]: value };
      requestAnimationFrame(() => onChange(next));
      return next;
    });
  }, [onChange]);

  // Update gradient overlay specifically
  const updateGradient = useCallback((updates: Partial<GradientOverlay>) => {
    setLocalEffects(prev => {
      const next = {
        ...prev,
        gradientOverlay: {
          ...prev.gradientOverlay!,
          ...updates,
        },
      };
      requestAnimationFrame(() => onChange(next));
      return next;
    });
  }, [onChange]);

  // Reset a section
  const resetSection = useCallback((sliders: SliderConfig[], e?: React.MouseEvent) => {
    e?.stopPropagation();
    setLocalEffects(prev => {
      const next = { ...prev };
      sliders.forEach(s => {
        (next as Record<string, unknown>)[s.key] = s.neutral;
      });
      requestAnimationFrame(() => onChange(next));
      return next;
    });
  }, [onChange]);

  // Reset all effects
  const resetAll = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const reset = { ...DEFAULT_EFFECTS };
    setLocalEffects(reset);
    onChange(reset);
  }, [onChange]);

  // Check if any effects are active in a section
  const sectionHasChanges = useCallback((sliders: SliderConfig[]) => {
    return sliders.some(s => {
      const value = localEffects[s.key];
      return value !== undefined && value !== s.neutral;
    });
  }, [localEffects]);

  const gradientHasChanges = useMemo(() => {
    const g = localEffects.gradientOverlay;
    return g && g.strength > 0;
  }, [localEffects.gradientOverlay]);
  
  const hasAnyChanges = useMemo(() => {
    return sectionHasChanges(LOOK_SLIDERS) || 
           sectionHasChanges(TEXTURE_SLIDERS) || 
           sectionHasChanges(ATMOSPHERE_SLIDERS) ||
           gradientHasChanges;
  }, [sectionHasChanges, gradientHasChanges]);

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

  const renderSlider = useCallback((config: SliderConfig) => {
    const value = (localEffects[config.key] as number) ?? config.neutral;
    const isActive = value !== config.neutral;
    const fill = getSliderFill(config, value);
    
    return (
      <div key={config.key} className={styles.sliderRow}>
        <label className={`${styles.sliderLabel} ${isActive ? styles.active : ''} ${isDragging ? styles.dragging : ''}`}>
          {config.label}
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
            onChange={(e) => updateEffect(config.key, parseFloat(e.target.value))}
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            className={`${styles.slider} ${isActive ? styles.sliderActive : ''}`}
          />
        </div>
      </div>
    );
  }, [localEffects, updateEffect, isDragging, getSliderFill]);

  const renderBand = useCallback((
    name: BandName, 
    title: string, 
    sliders: SliderConfig[],
    extraContent?: React.ReactNode
  ) => {
    const isExpanded = expandedBands.has(name);
    const hasChanges = sectionHasChanges(sliders) || (name === 'atmosphere' && gradientHasChanges);
    const primarySliders = sliders.filter(s => s.isPrimary);
    const secondarySliders = sliders.filter(s => !s.isPrimary);
    
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
                if (name === 'atmosphere') {
                  resetSection(sliders, e);
                  updateGradient({ strength: 0 });
                } else {
                  resetSection(sliders, e);
                }
              }}
              title={`Reset ${title.toLowerCase()}`}
            >
              ↺
            </button>
          )}
        </button>
        
        <div className={styles.bandContent}>
          {/* Always show primary sliders */}
          {primarySliders.map(renderSlider)}
          
          {/* Show secondary sliders when expanded */}
          {isExpanded && (
            <>
              {secondarySliders.map(renderSlider)}
              {extraContent}
            </>
          )}
        </div>
      </div>
    );
  }, [expandedBands, sectionHasChanges, gradientHasChanges, toggleBand, renderSlider, resetSection, updateGradient]);

  // Gradient controls for atmosphere band
  const gradientControls = (
    <>
      <div className={styles.sliderRow}>
        <label className={`${styles.sliderLabel} ${gradientHasChanges ? styles.active : ''} ${isDragging ? styles.dragging : ''}`}>
          Gradient
        </label>
        <div className={styles.sliderTrack}>
          <div 
            className={`${styles.sliderFill} ${gradientHasChanges ? styles.fillActive : ''}`}
            style={{
              left: '0%',
              width: `${(localEffects.gradientOverlay?.strength ?? 0) * 100}%`,
            }}
          />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={localEffects.gradientOverlay?.strength ?? 0}
            onChange={(e) => updateGradient({ strength: parseFloat(e.target.value) })}
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            className={`${styles.slider} ${gradientHasChanges ? styles.sliderActive : ''}`}
          />
        </div>
      </div>
      
      {(localEffects.gradientOverlay?.strength ?? 0) > 0 && (
        <>
          <div className={styles.sliderRow}>
            <label className={`${styles.sliderLabel} ${isDragging ? styles.dragging : ''}`}>Angle</label>
            <div className={styles.sliderTrack}>
              <input
                type="range"
                min={0}
                max={360}
                step={15}
                value={localEffects.gradientOverlay?.angle ?? 45}
                onChange={(e) => updateGradient({ angle: parseFloat(e.target.value) })}
                onMouseDown={() => setIsDragging(true)}
                onMouseUp={() => setIsDragging(false)}
                onMouseLeave={() => setIsDragging(false)}
                className={styles.slider}
              />
            </div>
          </div>
          <div className={styles.colorRow}>
            <label className={`${styles.sliderLabel} ${isDragging ? styles.dragging : ''}`}>Colors</label>
            <div className={styles.colorPickers}>
              <input
                type="color"
                value={localEffects.gradientOverlay?.colors[0] ?? '#000000'}
                onChange={(e) => updateGradient({ 
                  colors: [e.target.value, localEffects.gradientOverlay?.colors[1] ?? '#ffffff'] 
                })}
                className={styles.colorPicker}
              />
              <input
                type="color"
                value={localEffects.gradientOverlay?.colors[1] ?? '#ffffff'}
                onChange={(e) => updateGradient({ 
                  colors: [localEffects.gradientOverlay?.colors[0] ?? '#000000', e.target.value] 
                })}
                className={styles.colorPicker}
              />
            </div>
          </div>
        </>
      )}
    </>
  );

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
        <span className={styles.title}>Effects</span>
        {hasAnyChanges && (
          <button 
            className={styles.resetAllBtn} 
            onClick={resetAll}
            title="Reset all effects"
          >
            ↺
          </button>
        )}
      </div>

      <div className={styles.bands}>
        {renderBand('look', 'Look', LOOK_SLIDERS)}
        {renderBand('texture', 'Texture', TEXTURE_SLIDERS)}
        {renderBand('atmosphere', 'Atmosphere', ATMOSPHERE_SLIDERS, gradientControls)}
      </div>
    </div>
  );
}
