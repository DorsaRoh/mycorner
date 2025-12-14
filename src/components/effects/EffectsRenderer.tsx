import { useMemo, useId } from 'react';
import type { BlockEffects } from '@/shared/types';
import styles from './EffectsRenderer.module.css';

interface EffectsRendererProps {
  effects?: BlockEffects;
  children: React.ReactNode;
  className?: string;
}

export function EffectsRenderer({ effects, children, className }: EffectsRendererProps) {
  const filterId = useId();
  
  // Calculate CSS filter string for basic effects
  const cssFilter = useMemo(() => {
    if (!effects) return 'none';
    
    const filters: string[] = [];
    
    // Brightness: -1..1 maps to 0..2 (1 = neutral)
    if (effects.brightness !== undefined && effects.brightness !== 0) {
      filters.push(`brightness(${1 + effects.brightness})`);
    }
    
    // Contrast: -1..1 maps to 0..2 (1 = neutral)
    if (effects.contrast !== undefined && effects.contrast !== 0) {
      filters.push(`contrast(${1 + effects.contrast})`);
    }
    
    // Saturation: -1..1 maps to 0..2 (1 = neutral)
    if (effects.saturation !== undefined && effects.saturation !== 0) {
      filters.push(`saturate(${1 + effects.saturation})`);
    }
    
    // Hue shift: -180..180 degrees
    if (effects.hueShift !== undefined && effects.hueShift !== 0) {
      filters.push(`hue-rotate(${effects.hueShift}deg)`);
    }
    
    // Blur: 0..1 maps to 0..20px
    if (effects.blur !== undefined && effects.blur > 0) {
      filters.push(`blur(${effects.blur * 20}px)`);
    }
    
    return filters.length > 0 ? filters.join(' ') : 'none';
  }, [effects]);

  // Check if we need SVG filter for advanced effects
  const needsSvgFilter = useMemo(() => {
    if (!effects) return false;
    return (
      (effects.pixelate !== undefined && effects.pixelate > 0) ||
      (effects.noise !== undefined && effects.noise > 0) ||
      (effects.dither !== undefined && effects.dither > 0)
    );
  }, [effects]);

  // Calculate gradient overlay style
  const gradientOverlay = useMemo(() => {
    if (!effects?.gradientOverlay || effects.gradientOverlay.strength === 0) {
      return null;
    }
    
    const { strength, angle, colors } = effects.gradientOverlay;
    return {
      background: `linear-gradient(${angle}deg, ${colors[0]}, ${colors[1]})`,
      opacity: strength,
    };
  }, [effects?.gradientOverlay]);

  // Combine CSS filter with SVG filter reference if needed
  const combinedFilter = useMemo(() => {
    if (needsSvgFilter) {
      const svgFilterRef = `url(#${filterId})`;
      return cssFilter !== 'none' ? `${cssFilter} ${svgFilterRef}` : svgFilterRef;
    }
    return cssFilter;
  }, [cssFilter, needsSvgFilter, filterId]);

  // Calculate noise/dither parameters for SVG filter
  const textureParams = useMemo(() => {
    const grainSize = effects?.grainSize ?? 0.5;
    const noiseAmount = effects?.noise ?? 0;
    const ditherAmount = effects?.dither ?? 0;
    
    return {
      // Pixelation: 0..1 maps to 1..32 pixel size
      pixelSize: effects?.pixelate ? Math.max(1, Math.round(1 + effects.pixelate * 31)) : 1,
      // Noise frequency based on grain size
      noiseFreq: noiseAmount > 0 ? 0.5 + (1 - grainSize) * 1.5 : 0,
      noiseAmount,
      // Dither frequency
      ditherFreq: ditherAmount > 0 ? 0.8 + (1 - grainSize) * 0.4 : 0,
      ditherAmount,
    };
  }, [effects]);

  return (
    <div 
      className={`${styles.effectsWrapper} ${className || ''}`}
      style={{ filter: combinedFilter }}
    >
      {/* SVG filter definitions for advanced effects */}
      {needsSvgFilter && (
        <svg className={styles.filterDefs} aria-hidden="true">
          <defs>
            <filter id={filterId} x="0%" y="0%" width="100%" height="100%">
              {/* Pixelation effect using mosaic-like approach */}
              {textureParams.pixelSize > 1 && (
                <>
                  <feFlood x="4" y="4" height="2" width="2" />
                  <feComposite in2="SourceGraphic" operator="in" />
                  <feTile result="tiles" />
                  <feGaussianBlur stdDeviation={textureParams.pixelSize / 4} />
                  <feComposite in="SourceGraphic" operator="atop" />
                </>
              )}
              
              {/* Noise effect */}
              {textureParams.noiseAmount > 0 && (
                <>
                  <feTurbulence 
                    type="fractalNoise" 
                    baseFrequency={textureParams.noiseFreq}
                    numOctaves="4"
                    result="noise"
                  />
                  <feDisplacementMap 
                    in="SourceGraphic"
                    in2="noise"
                    scale={textureParams.noiseAmount * 10}
                    xChannelSelector="R"
                    yChannelSelector="G"
                    result="noiseDisplacement"
                  />
                  <feBlend 
                    in="SourceGraphic" 
                    in2="noiseDisplacement" 
                    mode="normal"
                    result="withNoise"
                  />
                </>
              )}
              
              {/* Dither effect using turbulence */}
              {textureParams.ditherAmount > 0 && (
                <>
                  <feTurbulence 
                    type="turbulence"
                    baseFrequency={textureParams.ditherFreq}
                    numOctaves="1"
                    result="dither"
                  />
                  <feColorMatrix
                    in="dither"
                    type="matrix"
                    values={`1 0 0 0 0
                             0 1 0 0 0
                             0 0 1 0 0
                             0 0 0 ${textureParams.ditherAmount * 0.5} 0`}
                    result="ditherAlpha"
                  />
                  <feBlend 
                    in="SourceGraphic" 
                    in2="ditherAlpha" 
                    mode="overlay"
                  />
                </>
              )}
            </filter>
          </defs>
        </svg>
      )}
      
      {children}
      
      {/* Gradient overlay */}
      {gradientOverlay && (
        <div 
          className={styles.gradientOverlay}
          style={gradientOverlay}
        />
      )}
    </div>
  );
}
