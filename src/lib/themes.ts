/**
 * Theme presets for MyCorner pages.
 * 
 * Themes are applied via CSS variables. Each theme defines colors,
 * typography, and visual style that's applied to the entire page.
 */

export interface Theme {
  id: string;
  name: string;
  description: string;
  
  // CSS variables (applied to :root or page container)
  variables: {
    // Background
    '--bg-primary': string;
    '--bg-secondary': string;
    '--bg-gradient'?: string;
    
    // Text colors
    '--text-primary': string;
    '--text-secondary': string;
    '--text-muted': string;
    
    // Accent colors
    '--accent-primary': string;
    '--accent-secondary': string;
    
    // Card/block styling
    '--card-bg': string;
    '--card-border': string;
    '--card-shadow': string;
    
    // Link styling
    '--link-color': string;
    '--link-hover': string;
  };
  
  // Background mode
  backgroundMode: 'solid' | 'gradient';
}

// =============================================================================
// Theme Presets (10 themes)
// =============================================================================

export const THEMES: Record<string, Theme> = {
  default: {
    id: 'default',
    name: 'Clean White',
    description: 'Minimal and clean',
    backgroundMode: 'solid',
    variables: {
      '--bg-primary': '#ffffff',
      '--bg-secondary': '#f8f9fa',
      '--text-primary': '#1a1a2e',
      '--text-secondary': '#4a4a68',
      '--text-muted': '#8b8b9e',
      '--accent-primary': '#6366f1',
      '--accent-secondary': '#818cf8',
      '--card-bg': '#ffffff',
      '--card-border': '#e5e7eb',
      '--card-shadow': '0 1px 3px rgba(0, 0, 0, 0.1)',
      '--link-color': '#6366f1',
      '--link-hover': '#4f46e5',
    },
  },
  
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    description: 'Dark and elegant',
    backgroundMode: 'solid',
    variables: {
      '--bg-primary': '#0f0f23',
      '--bg-secondary': '#1a1a2e',
      '--text-primary': '#e4e4f0',
      '--text-secondary': '#a0a0b8',
      '--text-muted': '#6b6b80',
      '--accent-primary': '#7c3aed',
      '--accent-secondary': '#a78bfa',
      '--card-bg': '#1a1a2e',
      '--card-border': '#2d2d44',
      '--card-shadow': '0 1px 3px rgba(0, 0, 0, 0.3)',
      '--link-color': '#a78bfa',
      '--link-hover': '#c4b5fd',
    },
  },
  
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm gradient vibes',
    backgroundMode: 'gradient',
    variables: {
      '--bg-primary': '#fef3e2',
      '--bg-secondary': '#fce7c8',
      '--bg-gradient': 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
      '--text-primary': '#5c3d2e',
      '--text-secondary': '#7a5545',
      '--text-muted': '#9a7565',
      '--accent-primary': '#e07b39',
      '--accent-secondary': '#f4a261',
      '--card-bg': 'rgba(255, 255, 255, 0.8)',
      '--card-border': '#f4d9c6',
      '--card-shadow': '0 2px 8px rgba(224, 123, 57, 0.15)',
      '--link-color': '#e07b39',
      '--link-hover': '#d4682a',
    },
  },
  
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    description: 'Cool blue depths',
    backgroundMode: 'gradient',
    variables: {
      '--bg-primary': '#e8f4f8',
      '--bg-secondary': '#d1e8ef',
      '--bg-gradient': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      '--text-primary': '#ffffff',
      '--text-secondary': '#e0e0f0',
      '--text-muted': '#c0c0d8',
      '--accent-primary': '#00d4ff',
      '--accent-secondary': '#7dd3fc',
      '--card-bg': 'rgba(255, 255, 255, 0.15)',
      '--card-border': 'rgba(255, 255, 255, 0.2)',
      '--card-shadow': '0 4px 16px rgba(0, 0, 0, 0.2)',
      '--link-color': '#7dd3fc',
      '--link-hover': '#38bdf8',
    },
  },
  
  forest: {
    id: 'forest',
    name: 'Forest',
    description: 'Nature-inspired greens',
    backgroundMode: 'solid',
    variables: {
      '--bg-primary': '#f0f7f4',
      '--bg-secondary': '#e1f0e8',
      '--text-primary': '#1e3a2f',
      '--text-secondary': '#3d5a4f',
      '--text-muted': '#6b8a7f',
      '--accent-primary': '#059669',
      '--accent-secondary': '#34d399',
      '--card-bg': '#ffffff',
      '--card-border': '#c6e2d5',
      '--card-shadow': '0 1px 4px rgba(5, 150, 105, 0.1)',
      '--link-color': '#059669',
      '--link-hover': '#047857',
    },
  },
  
  lavender: {
    id: 'lavender',
    name: 'Lavender Dream',
    description: 'Soft and calming',
    backgroundMode: 'gradient',
    variables: {
      '--bg-primary': '#f5f3ff',
      '--bg-secondary': '#ede9fe',
      '--bg-gradient': 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
      '--text-primary': '#3b2e58',
      '--text-secondary': '#5b4a78',
      '--text-muted': '#8b7aa8',
      '--accent-primary': '#8b5cf6',
      '--accent-secondary': '#a78bfa',
      '--card-bg': 'rgba(255, 255, 255, 0.7)',
      '--card-border': '#ddd6fe',
      '--card-shadow': '0 2px 8px rgba(139, 92, 246, 0.12)',
      '--link-color': '#8b5cf6',
      '--link-hover': '#7c3aed',
    },
  },
  
  monochrome: {
    id: 'monochrome',
    name: 'Monochrome',
    description: 'Black and white classic',
    backgroundMode: 'solid',
    variables: {
      '--bg-primary': '#fafafa',
      '--bg-secondary': '#f0f0f0',
      '--text-primary': '#171717',
      '--text-secondary': '#404040',
      '--text-muted': '#737373',
      '--accent-primary': '#171717',
      '--accent-secondary': '#404040',
      '--card-bg': '#ffffff',
      '--card-border': '#e5e5e5',
      '--card-shadow': '0 1px 2px rgba(0, 0, 0, 0.08)',
      '--link-color': '#171717',
      '--link-hover': '#404040',
    },
  },
  
  coral: {
    id: 'coral',
    name: 'Coral Reef',
    description: 'Vibrant and energetic',
    backgroundMode: 'solid',
    variables: {
      '--bg-primary': '#fff5f5',
      '--bg-secondary': '#ffe4e4',
      '--text-primary': '#4a2020',
      '--text-secondary': '#6b3a3a',
      '--text-muted': '#9a6a6a',
      '--accent-primary': '#f43f5e',
      '--accent-secondary': '#fb7185',
      '--card-bg': '#ffffff',
      '--card-border': '#fecdd3',
      '--card-shadow': '0 1px 4px rgba(244, 63, 94, 0.12)',
      '--link-color': '#f43f5e',
      '--link-hover': '#e11d48',
    },
  },
  
  aurora: {
    id: 'aurora',
    name: 'Aurora',
    description: 'Northern lights magic',
    backgroundMode: 'gradient',
    variables: {
      '--bg-primary': '#0c1222',
      '--bg-secondary': '#1a2744',
      '--bg-gradient': 'linear-gradient(135deg, #1a2744 0%, #0c1222 50%, #1a3a2c 100%)',
      '--text-primary': '#e8f0ff',
      '--text-secondary': '#a8c8e8',
      '--text-muted': '#6890b8',
      '--accent-primary': '#22d3ee',
      '--accent-secondary': '#4ade80',
      '--card-bg': 'rgba(30, 60, 90, 0.5)',
      '--card-border': 'rgba(34, 211, 238, 0.3)',
      '--card-shadow': '0 4px 16px rgba(0, 0, 0, 0.3)',
      '--link-color': '#22d3ee',
      '--link-hover': '#67e8f9',
    },
  },
  
  vintage: {
    id: 'vintage',
    name: 'Vintage Paper',
    description: 'Classic and warm',
    backgroundMode: 'solid',
    variables: {
      '--bg-primary': '#fdf8f3',
      '--bg-secondary': '#f5ebe0',
      '--text-primary': '#3d3229',
      '--text-secondary': '#5c4f42',
      '--text-muted': '#8a7a6b',
      '--accent-primary': '#b85c38',
      '--accent-secondary': '#d4826a',
      '--card-bg': '#fffcf8',
      '--card-border': '#e5d9cc',
      '--card-shadow': '0 1px 3px rgba(61, 50, 41, 0.1)',
      '--link-color': '#b85c38',
      '--link-hover': '#9a4a2e',
    },
  },
};

// =============================================================================
// Theme Helpers
// =============================================================================

/**
 * Get a theme by ID, falling back to default.
 */
export function getTheme(themeId: string): Theme {
  return THEMES[themeId] || THEMES.default;
}

/**
 * Get all available themes as an array.
 */
export function getAllThemes(): Theme[] {
  return Object.values(THEMES);
}

/**
 * Apply theme CSS variables to an element.
 */
export function applyTheme(element: HTMLElement, theme: Theme): void {
  Object.entries(theme.variables).forEach(([key, value]) => {
    element.style.setProperty(key, value);
  });
}

/**
 * Generate CSS string for a theme.
 */
export function getThemeCSS(theme: Theme): string {
  return Object.entries(theme.variables)
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n');
}

/**
 * Get background style for a theme.
 */
export function getThemeBackground(theme: Theme): React.CSSProperties {
  if (theme.backgroundMode === 'gradient' && theme.variables['--bg-gradient']) {
    return { background: theme.variables['--bg-gradient'] };
  }
  return { backgroundColor: theme.variables['--bg-primary'] };
}

