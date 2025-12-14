import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { BlockStyle } from '@/shared/types';
import { DEFAULT_STYLE } from '@/shared/types';
import styles from './StylePanel.module.css';

interface StylePanelProps {
  style?: BlockStyle;
  onChange: (style: BlockStyle) => void;
  onClose: () => void;
}

interface SliderConfig {
  key: keyof BlockStyle;
  label: string;
  min: number;
  max: number;
  step: number;
  neutral: number;
  isPrimary?: boolean;
}

const ROUNDNESS_SLIDERS: SliderConfig[] = [
  { key: 'borderRadius', label: 'Roundness', min: 0, max: 1, step: 0.02, neutral: 0, isPrimary: true },
];

const DEPTH_SLIDERS: SliderConfig[] = [
  { key: 'shadowStrength', label: 'Shadow', min: 0, max: 1, step: 0.02, neutral: 0, isPrimary: true },
  { key: 'shadowSoftness', label: 'Softness', min: 0, max: 1, step: 0.02, neutral: 0.5 },
  { key: 'shadowOffsetX', label: 'X offset', min: -1, max: 1, step: 0.05, neutral: 0 },
  { key: 'shadowOffsetY', label: 'Y offset', min: -1, max: 1, step: 0.05, neutral: 0.2 },
];

type BandName = 'roundness' | 'depth';

// Check if hint has been shown before
const HINT_SHOWN_KEY = 'style-panel-hint-shown';
function hasHintBeenShown(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(HINT_SHOWN_KEY) === 'true';
}
function markHintAsShown(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HINT_SHOWN_KEY, 'true');
}

export function StylePanel({ style, onChange, onClose }: StylePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [localStyle, setLocalStyle] = useState<BlockStyle>(() => ({
    ...DEFAULT_STYLE,
    ...style,
  }));
  
  // Track which bands are expanded (all collapsed by default)
  const [expandedBands, setExpandedBands] = useState<Set<BandName>>(new Set());
  
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

  const toggleBand = useCallback((band: BandName) => {
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

  // Update style value
  const updateStyle = useCallback((key: keyof BlockStyle, value: number | string) => {
    handleFirstInteraction();
    setLocalStyle(prev => {
      const next = { ...prev, [key]: value };
      requestAnimationFrame(() => onChange(next));
      return next;
    });
  }, [onChange, handleFirstInteraction]);

  // Reset a section
  const resetSection = useCallback((sliders: SliderConfig[], e?: React.MouseEvent) => {
    e?.stopPropagation();
    setLocalStyle(prev => {
      const next = { ...prev };
      sliders.forEach(s => {
        (next as Record<string, unknown>)[s.key] = s.neutral;
      });
      requestAnimationFrame(() => onChange(next));
      return next;
    });
  }, [onChange]);

  // Reset all styles
  const resetAll = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const reset = { ...DEFAULT_STYLE };
    setLocalStyle(reset);
    onChange(reset);
  }, [onChange]);

  // Check if any styles are active in a section
  const sectionHasChanges = useCallback((sliders: SliderConfig[]) => {
    return sliders.some(s => {
      const value = localStyle[s.key];
      return value !== undefined && value !== s.neutral;
    });
  }, [localStyle]);

  const hasAnyChanges = useMemo(() => {
    return sectionHasChanges(ROUNDNESS_SLIDERS) || 
           sectionHasChanges(DEPTH_SLIDERS);
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

  const renderSlider = useCallback((config: SliderConfig) => {
    const value = (localStyle[config.key] as number) ?? config.neutral;
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
            onChange={(e) => updateStyle(config.key, parseFloat(e.target.value))}
            onMouseDown={() => { setIsDragging(true); handleFirstInteraction(); }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            className={`${styles.slider} ${isActive ? styles.sliderActive : ''}`}
          />
        </div>
      </div>
    );
  }, [localStyle, updateStyle, isDragging, getSliderFill, handleFirstInteraction]);

  const renderBand = useCallback((
    name: BandName, 
    title: string, 
    sliders: SliderConfig[],
    extraContent?: React.ReactNode
  ) => {
    const isExpanded = expandedBands.has(name);
    const hasChanges = sectionHasChanges(sliders);
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
              onClick={(e) => resetSection(sliders, e)}
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
  }, [expandedBands, sectionHasChanges, toggleBand, renderSlider, resetSection]);

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
        <span className={styles.title}>Style</span>
        {hasAnyChanges && (
          <button 
            className={styles.resetAllBtn} 
            onClick={resetAll}
            title="Reset all styles"
          >
            ↺
          </button>
        )}
      </div>

      {/* Hint for first-time users */}
      {showHint && (
        <div className={styles.hint}>
          slide things until it feels right
        </div>
      )}

      <div className={styles.bands}>
        {renderBand('roundness', 'Roundness', ROUNDNESS_SLIDERS)}
        {renderBand('depth', 'Depth', DEPTH_SLIDERS)}
      </div>
    </div>
  );
}
