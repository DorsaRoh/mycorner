import { useEffect, useState } from 'react';
import type { BackgroundConfig } from '@/shared/types';
import styles from './BackgroundLayer.module.css';

interface BackgroundLayerProps {
  config?: BackgroundConfig;
  className?: string;
}

export function BackgroundLayer({ config, className }: BackgroundLayerProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Check for prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  if (!config) return null;

  // Prepare CSS custom properties for the background
  const styleVars: Record<string, string> = {};

  // Solid color
  if (config.mode === 'solid' && config.solid) {
    const { color, opacity } = config.solid;
    styleVars['--bg-solid-color'] = color;
    styleVars['--bg-solid-opacity'] = opacity.toString();
  }

  // Gradient
  if (config.mode === 'gradient' && config.gradient) {
    const { type, colorA, colorB, angle, opacity } = config.gradient;
    styleVars['--bg-gradient-type'] = type;
    styleVars['--bg-gradient-color-a'] = colorA;
    styleVars['--bg-gradient-color-b'] = colorB;
    styleVars['--bg-gradient-angle'] = `${angle}deg`;
    styleVars['--bg-gradient-opacity'] = opacity.toString();
  }

  // Texture
  if (config.texture && config.texture.type !== 'none') {
    const { type, intensity, scale, opacity } = config.texture;
    styleVars['--bg-texture-type'] = type;
    styleVars['--bg-texture-intensity'] = intensity.toString();
    styleVars['--bg-texture-scale'] = scale.toString();
    styleVars['--bg-texture-opacity'] = opacity.toString();
  }

  // Lighting
  if (config.lighting) {
    const { vignette, brightness, contrast } = config.lighting;
    styleVars['--bg-vignette'] = vignette.toString();
    styleVars['--bg-brightness'] = `${brightness * 100 + 100}%`;
    styleVars['--bg-contrast'] = `${contrast * 100 + 100}%`;
  }

  // Motion
  if (config.motion?.enabled && !prefersReducedMotion) {
    const { speed } = config.motion;
    styleVars['--bg-motion-speed'] = speed;
  }

  // Build class names including motion speed
  let classNames = `${styles.backgroundLayer} ${className || ''}`;
  if (config.motion?.enabled && !prefersReducedMotion && config.motion.speed) {
    classNames += ` ${styles[`motion-${config.motion.speed}`]}`;
  }

  return (
    <div
      className={classNames}
      style={styleVars}
      data-mode={config.mode}
      data-texture={config.texture?.type || 'none'}
      data-motion={config.motion?.enabled && !prefersReducedMotion ? 'enabled' : 'disabled'}
    >
      {/* Base background layer */}
      <div className={styles.baseLayer} />

      {/* Texture overlay */}
      {config.texture && config.texture.type !== 'none' && (
        <div className={styles.textureLayer} />
      )}

      {/* Lighting overlay */}
      {config.lighting && (
        <div className={styles.lightingLayer} />
      )}
    </div>
  );
}