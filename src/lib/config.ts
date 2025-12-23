/**
 * Typed configuration module.
 * Validates environment variables at boot and provides typed access.
 */

// =============================================================================
// Environment variable validation
// =============================================================================

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, defaultValue: string = ''): string {
  return process.env[name] || defaultValue;
}

function optionalBool(name: string, defaultValue: boolean = false): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value === 'true' || value === '1';
}

function optionalInt(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// =============================================================================
// Detect environment
// =============================================================================

const isDev = process.env.NODE_ENV !== 'production';
// Check if running on server (Node.js) or client (browser)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isServer = typeof (globalThis as any).window === 'undefined';

// =============================================================================
// Configuration object
// =============================================================================

interface Config {
  // Environment
  isDev: boolean;
  isServer: boolean;
  nodeEnv: string;
  
  // Server
  port: number;
  publicUrl: string;
  corsOrigin: string;
  
  // Database
  databaseUrl: string;
  useSqlite: boolean;
  sqlitePath: string;
  
  // Auth
  googleClientId: string;
  googleClientSecret: string;
  sessionSecret: string;
  
  // Supabase Storage
  supabaseUrl: string;
  supabaseServiceKey: string;
  supabaseStorageBucket: string;
  
  // Analytics & Monitoring
  plausibleDomain: string;
  sentryDsn: string;
}

// Lazy-loaded config to avoid errors during build
let _config: Config | null = null;

function loadConfig(): Config {
  // Check if DATABASE_URL is available
  const databaseUrl = optional('DATABASE_URL', '');
  
  // Use SQLite only if explicitly set OR if no DATABASE_URL in development
  const useSqliteEnv = optionalBool('USE_SQLITE', false);
  const useSqlite = useSqliteEnv || (!databaseUrl && isDev);
  
  // Require DATABASE_URL in production (unless SQLite explicitly enabled, which is blocked later)
  if (!useSqlite && !databaseUrl && !isDev) {
    throw new Error('DATABASE_URL is required in production');
  }
  
  if (isDev && !databaseUrl && !useSqliteEnv) {
    console.warn('⚠️  DATABASE_URL not set, using SQLite for development');
  }
  
  // Auth is optional in development
  const googleClientId = isDev 
    ? optional('GOOGLE_CLIENT_ID', '') 
    : required('GOOGLE_CLIENT_ID');
  const googleClientSecret = isDev 
    ? optional('GOOGLE_CLIENT_SECRET', '') 
    : required('GOOGLE_CLIENT_SECRET');
  
  // Session secret - required in production
  const sessionSecret = isDev
    ? optional('SESSION_SECRET', 'dev-secret-change-in-production')
    : required('SESSION_SECRET');
  
  // Public URL - support both APP_ORIGIN (Vercel) and PUBLIC_URL
  const port = optionalInt('PORT', 3000);
  const defaultUrl = isDev ? `http://localhost:${port}` : '';
  const publicUrl = process.env.APP_ORIGIN 
    || process.env.PUBLIC_URL 
    || (isDev ? defaultUrl : '');
  
  if (!publicUrl && !isDev) {
    throw new Error('Missing required environment variable: APP_ORIGIN or PUBLIC_URL');
  }
  
  return {
    isDev,
    isServer,
    nodeEnv: optional('NODE_ENV', 'development'),
    
    port: optionalInt('PORT', 3000),
    publicUrl,
    corsOrigin: optional('CORS_ORIGIN', publicUrl),
    
    databaseUrl,
    useSqlite,
    sqlitePath: optional('DATABASE_PATH', './data/my-corner.db'),
    
    googleClientId,
    googleClientSecret,
    sessionSecret,
    
    supabaseUrl: optional('SUPABASE_URL', ''),
    // Check multiple common env var names for the service key
    supabaseServiceKey: optional('SUPABASE_SERVICE_KEY', '') || optional('SUPABASE_SERVICE_ROLE_KEY', ''),
    supabaseStorageBucket: optional('SUPABASE_STORAGE_BUCKET', 'uploads'),
    
    plausibleDomain: optional('NEXT_PUBLIC_PLAUSIBLE_DOMAIN', ''),
    sentryDsn: optional('SENTRY_DSN', ''),
  };
}

/**
 * Get the application configuration.
 * Validates required environment variables on first access.
 */
export function getConfig(): Config {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

/**
 * Check if all required environment variables are set.
 * Call this at server startup to fail fast.
 */
export function validateConfig(): void {
  const config = getConfig();
  
  console.log('🔧 Configuration:');
  console.log(`   Environment: ${config.nodeEnv}`);
  console.log(`   Database: ${config.useSqlite ? 'SQLite' : 'PostgreSQL'}`);
  console.log(`   Auth: ${config.googleClientId ? 'Configured' : 'Not configured'}`);
  
  // Determine storage status with helpful warnings
  const hasSupabaseUrl = !!config.supabaseUrl;
  const hasSupabaseKey = !!config.supabaseServiceKey;
  if (hasSupabaseUrl && hasSupabaseKey) {
    console.log('   Storage: Supabase');
  } else if (hasSupabaseUrl && !hasSupabaseKey) {
    console.log('   Storage: Local disk');
    console.warn('   ⚠️  SUPABASE_URL is set but SUPABASE_SERVICE_KEY is missing - using local storage');
    console.warn('      To use Supabase Storage, set SUPABASE_SERVICE_KEY to your service_role key');
  } else {
    console.log('   Storage: Local disk');
  }
  
  console.log(`   Public URL: ${config.publicUrl}`);
  
  if (!config.isDev) {
    // Strict validation in production
    if (config.useSqlite) {
      throw new Error('SQLite is not supported in production. Set DATABASE_URL.');
    }
    if (!config.googleClientId || !config.googleClientSecret) {
      throw new Error('Google OAuth is required in production.');
    }
    if (config.sessionSecret === 'dev-secret-change-in-production') {
      throw new Error('SESSION_SECRET must be set in production.');
    }
    
    // DEPLOYMENT INVARIANT: Static pages require S3_PUBLIC_BASE_URL
    // Without this, /u/[slug] will 404 and /api/publish will 503
    const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL || process.env.PUBLIC_PAGES_BASE_URL;
    if (!publicBaseUrl) {
      throw new Error(
        'S3_PUBLIC_BASE_URL is required in production. ' +
        'Public pages are served from object storage. ' +
        'Set S3_PUBLIC_BASE_URL to your CDN/storage public URL (e.g., https://cdn.yourdomain.com).'
      );
    }
    console.log(`   Public Pages: ${publicBaseUrl}`);
  }
}

// Export for client-side use (only public values)
export const publicConfig = {
  plausibleDomain: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN || '',
};

