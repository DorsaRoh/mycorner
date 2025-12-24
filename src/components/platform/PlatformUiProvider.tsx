/**
 * PlatformUiProvider
 * 
 * Context provider that computes and applies platform UI tokens
 * based on the current page background. Wrap your page/app in this
 * to enable automatic contrast adaptation for all platform UI.
 */

import { createContext, useContext, useMemo } from 'react';
import type { BackgroundConfig } from '@/shared/types';
import { computeUiTokens, getUiMode, type UiTokens, type UiMode } from '@/lib/platformUi';

interface PlatformUiContextValue {
  tokens: UiTokens;
  mode: UiMode;
  background?: BackgroundConfig;
}

const PlatformUiContext = createContext<PlatformUiContextValue>({
  tokens: computeUiTokens(undefined),
  mode: 'light',
  background: undefined,
});

interface PlatformUiProviderProps {
  background?: BackgroundConfig;
  children: React.ReactNode;
}

/**
 * Provider that computes UI tokens from page background and applies them
 * as CSS custom properties on a wrapper element.
 */
export function PlatformUiProvider({ background, children }: PlatformUiProviderProps) {
  const value = useMemo(() => {
    const tokens = computeUiTokens(background);
    const mode = getUiMode(background);
    return { tokens, mode, background };
  }, [background]);

  // Convert tokens to CSS custom properties style object
  const style = useMemo(() => {
    const cssVars: Record<string, string> = {};
    for (const [key, val] of Object.entries(value.tokens)) {
      cssVars[key] = val;
    }
    // Also set legacy variables for backward compatibility
    cssVars['--ui-text'] = value.tokens['--platform-text'];
    cssVars['--ui-text-muted'] = value.tokens['--platform-text-muted'];
    cssVars['--ui-text-shadow'] = value.tokens['--platform-text-shadow'];
    cssVars['--ui-bg'] = value.tokens['--platform-surface'];
    cssVars['--ui-bg-hover'] = value.tokens['--platform-surface-hover'];
    cssVars['--ui-border'] = value.tokens['--platform-border'];
    return cssVars as React.CSSProperties;
  }, [value.tokens]);

  return (
    <PlatformUiContext.Provider value={value}>
      <div style={style} data-platform-ui-root>
        {children}
      </div>
    </PlatformUiContext.Provider>
  );
}

/**
 * Hook to access platform UI context values.
 */
export function usePlatformUi() {
  return useContext(PlatformUiContext);
}

