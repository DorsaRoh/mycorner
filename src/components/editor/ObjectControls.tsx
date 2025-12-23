import { useState, useCallback, useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import type { BlockStyle, BlockType } from '@/shared/types';
import { DEFAULT_STYLE } from '@/shared/types';
import styles from './ObjectControls.module.css';

// Minimum margin from viewport edges
const VIEWPORT_MARGIN = 16;

// Available font families
const FONT_FAMILIES = [
  { value: 'system-ui, -apple-system, sans-serif', label: 'System' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Times New Roman, serif', label: 'Times' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: 'Courier New, monospace', label: 'Mono' },
  { value: 'Comic Sans MS, cursive', label: 'Comic' },
  { value: 'Impact, sans-serif', label: 'Impact' },
  { value: '"Press Start 2P", cursive', label: 'Pixel' },
];

interface ObjectControlsProps {
  blockType?: BlockType;
  style?: BlockStyle;
  onChange: (style: BlockStyle) => void;
  onChangeMultiple?: (updates: Partial<BlockStyle>) => void;
  onClose?: () => void;
  multiSelected?: boolean;
}

interface SliderConfig {
  key: keyof BlockStyle;
  label: string;
  min: number;
  max: number;
  step: number;
  neutral: number;
  icon?: string;
}

// Organic style groups - continuous sliders, no fixed presets
// Shape → roundness
// Depth → shadow
// Presence → opacity

// Image controls - shape and depth
const IMAGE_CONTROLS: SliderConfig[] = [
  { key: 'borderRadius', label: 'shape', min: 0, max: 1, step: 0.02, neutral: 0, icon: '○' },
  { key: 'shadowStrength', label: 'depth', min: 0, max: 1, step: 0.02, neutral: 0, icon: '▲' },
];

// Text/Link controls - weight, presence (opacity), plus shape/depth for visual effects
const TEXT_SLIDER_CONTROLS: SliderConfig[] = [
  { key: 'fontWeight', label: 'weight', min: 100, max: 900, step: 100, neutral: 400, icon: 'B' },
  { key: 'textOpacity', label: 'presence', min: 0, max: 1, step: 0.02, neutral: 1, icon: '◉' },
];

export function ObjectControls({ blockType = 'IMAGE', style, onChange, onChangeMultiple, onClose, multiSelected = false }: ObjectControlsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [localStyle, setLocalStyle] = useState<BlockStyle>(() => ({
    ...DEFAULT_STYLE,
    ...style,
  }));

  const [isDragging, setIsDragging] = useState<string | null>(null);
  
  // Position adjustment state: 'right' (default), 'left', 'above', or 'below'
  const [position, setPosition] = useState<'right' | 'left' | 'above' | 'below'>('right');
  
  // Check and adjust position when controls would overflow viewport
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    
    const checkPosition = () => {
      const container = containerRef.current;
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Check if controls overflow right edge
      if (rect.right > viewportWidth - VIEWPORT_MARGIN) {
        // Try left positioning
        setPosition('left');
      } else if (rect.left < VIEWPORT_MARGIN) {
        // If left would also overflow, try above/below
        if (rect.bottom > viewportHeight - VIEWPORT_MARGIN) {
          setPosition('above');
        } else {
          setPosition('below');
        }
      } else {
        setPosition('right');
      }
    };
    
    // Check synchronously on mount to prevent visual flash
    checkPosition();
    
    // Also check on window resize
    window.addEventListener('resize', checkPosition);
    return () => window.removeEventListener('resize', checkPosition);
  }, []);

  // Update local style when prop changes (rehydrate on reselect)
  useEffect(() => {
    setLocalStyle({
      ...DEFAULT_STYLE,
      ...style,
    });
  }, [style]);

  // Handle style update with live feedback
  const updateStyle = useCallback((key: keyof BlockStyle, value: number | string) => {
    setLocalStyle(prev => {
      const next = { ...prev, [key]: value };
      // Live update with animation frame for smooth feedback
      requestAnimationFrame(() => {
        if (multiSelected && onChangeMultiple) {
          onChangeMultiple({ [key]: value });
        } else {
          onChange(next);
        }
      });
      return next;
    });
  }, [onChange, onChangeMultiple, multiSelected]);

  // Calculate fill percentage for slider visualization - always from left
  const getSliderFill = useCallback((config: SliderConfig, value: number) => {
    const range = config.max - config.min;
    const valuePercent = ((value - config.min) / range) * 100;
    
    return {
      left: '0%',
      width: `${valuePercent}%`,
    };
  }, []);

  // Render individual control slider
  const renderControl = useCallback((config: SliderConfig) => {
    const value = (localStyle[config.key] as number) ?? config.neutral;
    const isActive = value !== config.neutral;
    const fill = getSliderFill(config, value);
    const isThisDragging = isDragging === config.key;

    return (
      <div key={config.key} className={styles.control}>
        <div className={styles.controlHeader}>
          <span className={styles.controlIcon}>{config.icon}</span>
          <label className={`${styles.controlLabel} ${isActive ? styles.active : ''} ${isThisDragging ? styles.dragging : ''}`}>
            {config.label}
          </label>
        </div>

        <div className={styles.sliderTrack}>
          <div
            className={`${styles.sliderFill} ${isActive ? styles.fillActive : ''} ${isThisDragging ? styles.fillDragging : ''}`}
            style={fill}
          />
          <input
            type="range"
            min={config.min}
            max={config.max}
            step={config.step}
            value={value}
            onChange={(e) => updateStyle(config.key, parseFloat(e.target.value))}
            onMouseDown={() => setIsDragging(config.key)}
            onMouseUp={() => setIsDragging(null)}
            onMouseLeave={() => setIsDragging(null)}
            className={`${styles.slider} ${isActive ? styles.sliderActive : ''} ${isThisDragging ? styles.sliderDragging : ''}`}
          />
        </div>
      </div>
    );
  }, [localStyle, updateStyle, isDragging, getSliderFill]);

  // Render font family selector for text
  const renderFontSelector = useCallback(() => {
    const currentFont = localStyle.fontFamily || DEFAULT_STYLE.fontFamily;
    
    return (
      <div className={styles.control}>
        <div className={styles.controlHeader}>
          <span className={styles.controlIcon}>F</span>
          <label className={styles.controlLabel}>font</label>
        </div>
        <select
          className={styles.fontSelect}
          value={currentFont}
          onChange={(e) => updateStyle('fontFamily', e.target.value)}
        >
          {FONT_FAMILIES.map(font => (
            <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
              {font.label}
            </option>
          ))}
        </select>
      </div>
    );
  }, [localStyle.fontFamily, updateStyle]);

  // Render color picker for text
  const renderColorPicker = useCallback(() => {
    // Convert rgba to hex for the color input
    const currentColor = localStyle.color || DEFAULT_STYLE.color || '#000000';
    let hexColor = '#000000';
    
    if (currentColor.startsWith('#')) {
      hexColor = currentColor;
    } else if (currentColor.startsWith('rgba') || currentColor.startsWith('rgb')) {
      // Parse rgba and convert to hex
      const match = currentColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        const r = parseInt(match[1]).toString(16).padStart(2, '0');
        const g = parseInt(match[2]).toString(16).padStart(2, '0');
        const b = parseInt(match[3]).toString(16).padStart(2, '0');
        hexColor = `#${r}${g}${b}`;
      }
    }
    
    const handleColorChange = (hex: string) => {
      // Convert hex to rgba
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      updateStyle('color', `rgba(${r}, ${g}, ${b}, 1)`);
    };
    
    return (
      <div className={styles.control}>
        <div className={styles.controlHeader}>
          <span className={styles.controlIcon}>◆</span>
          <label className={styles.controlLabel}>color</label>
        </div>
        <div className={styles.colorPickerWrapper}>
          <input
            type="color"
            value={hexColor}
            onChange={(e) => handleColorChange(e.target.value)}
            className={styles.colorPicker}
          />
          <span className={styles.colorPreview} style={{ backgroundColor: hexColor }} />
        </div>
      </div>
    );
  }, [localStyle.color, updateStyle]);

  // Local state for font size input to allow free typing
  const [fontSizeInput, setFontSizeInput] = useState<string>(() => 
    String(localStyle.fontSize || DEFAULT_STYLE.fontSize || 16)
  );
  
  // Sync input when external style changes
  useEffect(() => {
    setFontSizeInput(String(localStyle.fontSize || DEFAULT_STYLE.fontSize || 16));
  }, [localStyle.fontSize]);

  // Render font size input for text
  const renderFontSizeInput = useCallback(() => {
    const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Allow free typing - just update local state
      setFontSizeInput(e.target.value);
    };
    
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      // Validate and commit on blur
      const value = parseInt(e.target.value) || 16;
      const clampedValue = Math.max(10, value);
      setFontSizeInput(String(clampedValue));
      updateStyle('fontSize', clampedValue);
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.currentTarget.blur();
      }
    };
    
    return (
      <div className={styles.control}>
        <div className={styles.controlHeader}>
          <span className={styles.controlIcon}>Aa</span>
          <label className={styles.controlLabel}>size</label>
        </div>
        <div className={styles.fontSizeInputWrapper}>
          <input
            type="number"
            min={10}
            value={fontSizeInput}
            onChange={handleSizeChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onFocus={(e) => e.target.select()}
            className={styles.fontSizeInput}
          />
          <span className={styles.fontSizeUnit}>px</span>
        </div>
      </div>
    );
  }, [fontSizeInput, updateStyle]);

  // Render text alignment buttons
  const renderAlignmentButtons = useCallback(() => {
    const currentAlign = localStyle.textAlign || DEFAULT_STYLE.textAlign || 'left';
    
    const alignments: Array<{ value: 'left' | 'center' | 'right'; icon: string; label: string }> = [
      { value: 'left', icon: '☰', label: 'Left' },
      { value: 'center', icon: '☰', label: 'Center' },
      { value: 'right', icon: '☰', label: 'Right' },
    ];
    
    return (
      <div className={styles.control}>
        <div className={styles.controlHeader}>
          <span className={styles.controlIcon}>¶</span>
          <label className={styles.controlLabel}>align</label>
        </div>
        <div className={styles.alignmentButtons}>
          {alignments.map(({ value, label }) => (
            <button
              key={value}
              className={`${styles.alignButton} ${currentAlign === value ? styles.alignButtonActive : ''}`}
              onClick={() => updateStyle('textAlign', value)}
              title={label}
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                {value === 'left' && (
                  <>
                    <rect x="1" y="2" width="12" height="1.5" rx="0.5" />
                    <rect x="1" y="6" width="8" height="1.5" rx="0.5" />
                    <rect x="1" y="10" width="10" height="1.5" rx="0.5" />
                  </>
                )}
                {value === 'center' && (
                  <>
                    <rect x="1" y="2" width="12" height="1.5" rx="0.5" />
                    <rect x="3" y="6" width="8" height="1.5" rx="0.5" />
                    <rect x="2" y="10" width="10" height="1.5" rx="0.5" />
                  </>
                )}
                {value === 'right' && (
                  <>
                    <rect x="1" y="2" width="12" height="1.5" rx="0.5" />
                    <rect x="5" y="6" width="8" height="1.5" rx="0.5" />
                    <rect x="3" y="10" width="10" height="1.5" rx="0.5" />
                  </>
                )}
              </svg>
            </button>
          ))}
        </div>
      </div>
    );
  }, [localStyle.textAlign, updateStyle]);

  // Get controls based on block type
  const controls = useMemo(() => {
    if (blockType === 'TEXT' || blockType === 'LINK') {
      return TEXT_SLIDER_CONTROLS;
    }
    return IMAGE_CONTROLS;
  }, [blockType]);

  // Position controls relative to the object with viewport-aware adjustment
  const positionClass = useMemo(() => {
    switch (position) {
      case 'left': return styles.positionLeft;
      case 'above': return styles.positionAbove;
      case 'below': return styles.positionBelow;
      default: return ''; // 'right' is default in CSS
    }
  }, [position]);

  return (
    <div
      ref={containerRef}
      className={`${styles.controls} ${positionClass}`}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Text-specific controls: font family, color, size (for TEXT and LINK) */}
      {(blockType === 'TEXT' || blockType === 'LINK') && (
        <>
          {renderFontSelector()}
          {renderColorPicker()}
          {renderFontSizeInput()}
        </>
      )}
      
      {/* Alignment for TEXT and LINK blocks (unified styling) */}
      {(blockType === 'TEXT' || blockType === 'LINK') && renderAlignmentButtons()}
      
      {/* Slider controls */}
      {controls.map(renderControl)}
    </div>
  );
}

