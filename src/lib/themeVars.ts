/**
 * theme vars utility for deterministic styling on ssr and client hydration.
 * 
 * this module exports the default editor theme vars that must be present
 * on document.documentElement (:root) before first paint to prevent
 * nondeterministic styling on hard refresh.
 */

/**
 * default editor theme css variables.
 * these match the :root vars in globals.css and must be applied
 * to <html> during ssr to guarantee they exist at first paint.
 */
export const DEFAULT_THEME_VARS: Record<string, string> = {
  // accent
  '--color-accent': '#000000',
  '--color-accent-light': 'rgba(0, 0, 0, 0.08)',
  '--color-accent-hover': '#333333',
  
  // background & surface
  '--color-bg': '#f8f6f1',
  '--color-bg-pure': '#f8f6f1',
  '--color-canvas': '#f8f6f1',
  '--color-surface': '#f3f1ec',
  
  // border
  '--color-border': '#e0e0e0',
  '--color-border-light': 'rgba(0, 0, 0, 0.03)',
  
  // text
  '--color-text': '#333333',
  '--color-text-muted': '#888888',
  '--color-text-light': '#aaaaaa',
  '--color-text-inverse': '#ffffff',
  
  // semantic
  '--color-success': '#666666',
  '--color-error': '#888888',
  
  // typography
  '--font-sans': "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  '--font-mono': "'JetBrains Mono', 'Fira Code', monospace",
  
  // transitions
  '--transition-fast': '0.15s cubic-bezier(0.23, 1, 0.32, 1)',
  '--transition-normal': '0.25s cubic-bezier(0.23, 1, 0.32, 1)',
  
  // sizing
  '--radius': '12px',
};

/**
 * convert theme vars record to inline style string for ssr.
 */
export function themeVarsToStyleString(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([key, value]) => `${key}: ${value};`)
    .join(' ');
}

/**
 * apply css vars to an html element (typically document.documentElement).
 * use this in useLayoutEffect for synchronous application before paint.
 */
export function applyCssVars(target: HTMLElement, vars: Record<string, string>): void {
  Object.entries(vars).forEach(([key, value]) => {
    target.style.setProperty(key, value);
  });
}

/**
 * dev-only assertion: check that critical theme vars exist on :root.
 * logs an error if any are missing.
 */
export function assertThemeVarsOnRoot(): void {
  if (process.env.NODE_ENV === 'production') return;
  if (typeof window === 'undefined') return;
  
  const root = document.documentElement;
  const computedStyle = getComputedStyle(root);
  
  const criticalVars = ['--font-sans', '--color-bg-pure', '--color-text'];
  const values: Record<string, string> = {};
  const missing: string[] = [];
  
  criticalVars.forEach(varName => {
    const value = computedStyle.getPropertyValue(varName).trim();
    values[varName] = value || '(empty)';
    if (!value) {
      missing.push(varName);
    }
  });
  
  console.log('[themeVars] computed values on :root:', values);
  
  if (missing.length > 0) {
    console.error('[themeVars] ❌ theme vars missing on :root:', missing);
  } else {
    console.log('[themeVars] ✓ all critical theme vars present on :root');
  }
}

