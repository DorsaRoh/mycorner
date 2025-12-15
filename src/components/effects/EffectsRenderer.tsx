import { useMemo } from 'react';
import type { BlockEffects } from '@/shared/types';
import styles from './EffectsRenderer.module.css';

interface EffectsRendererProps {
  effects?: BlockEffects;
  children: React.ReactNode;
  className?: string;
}

export function EffectsRenderer({ effects, children, className }: EffectsRendererProps) {
  const filter = useMemo(() => {
    if (!effects) return undefined;
    const filters: string[] = [];
    if (effects.brightness) filters.push(`brightness(${1 + effects.brightness})`);
    if (effects.contrast) filters.push(`contrast(${1 + effects.contrast})`);
    if (effects.saturation) filters.push(`saturate(${1 + effects.saturation})`);
    if (effects.hueShift) filters.push(`hue-rotate(${effects.hueShift}deg)`);
    if (effects.blur) filters.push(`blur(${effects.blur * 20}px)`);
    return filters.length > 0 ? filters.join(' ') : undefined;
  }, [effects]);

  return (
    <div className={`${styles.effectsWrapper} ${className || ''}`} style={{ filter }}>
      {children}
    </div>
  );
}

