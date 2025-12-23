/**
 * Database facade - switches between SQLite (dev) and PostgreSQL (prod).
 * 
 * Uses lazy async imports to work correctly in Vercel's serverless environment.
 * All functions are async and automatically load the correct adapter.
 */

// Re-export types
export type { DbUser, DbPage, DbFeedback, DbProductFeedback, PublishPageParams, PublishPageResult } from './types';

// =============================================================================
// Lazy adapter loading
// =============================================================================

type PostgresModule = typeof import('./postgres');
type SqliteModule = typeof import('./sqlite');
type DbModule = PostgresModule | SqliteModule;

let cachedAdapter: DbModule | null = null;

/**
 * Get the database adapter lazily.
 * This avoids CommonJS/ESM interop issues in Vercel's serverless environment.
 */
async function getAdapter(): Promise<DbModule> {
  if (cachedAdapter) return cachedAdapter;
  
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Use dynamic import instead of require() for proper ESM support
  if (isProduction) {
    cachedAdapter = await import('./postgres');
  } else {
    cachedAdapter = await import('./sqlite');
  }
  
  return cachedAdapter;
}

// =============================================================================
// User Operations
// =============================================================================

export async function upsertUserByGoogleSub(params: {
  googleSub: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}) {
  const adapter = await getAdapter();
  return adapter.upsertUserByGoogleSub(params);
}

export async function getUserById(id: string) {
  const adapter = await getAdapter();
  return adapter.getUserById(id);
}

export async function getUserByEmail(email: string) {
  const adapter = await getAdapter();
  return adapter.getUserByEmail(email);
}

export async function getUserByUsername(username: string) {
  const adapter = await getAdapter();
  return adapter.getUserByUsername(username);
}

export async function isUsernameTaken(username: string) {
  const adapter = await getAdapter();
  return adapter.isUsernameTaken(username);
}

export async function setUsername(userId: string, username: string) {
  const adapter = await getAdapter();
  return adapter.setUsername(userId, username);
}

export async function setUsernameIfMissing(userId: string, username: string) {
  const adapter = await getAdapter();
  return adapter.setUsernameIfMissing(userId, username);
}

// re-export username generation helpers
export { generateUsernameBase, ensureUniqueUsername, isValidUsernameFormat } from './username';

// =============================================================================
// Page Operations
// =============================================================================

export async function createPage(ownerId: string, title?: string, userId?: string) {
  const adapter = await getAdapter();
  return adapter.createPage(ownerId, title, userId);
}

export async function getPageById(id: string) {
  const adapter = await getAdapter();
  return adapter.getPageById(id);
}

export async function getPageBySlug(slug: string) {
  const adapter = await getAdapter();
  return adapter.getPageBySlug(slug);
}

export async function getPagesByUserId(userId: string) {
  const adapter = await getAdapter();
  return adapter.getPagesByUserId(userId);
}

export async function getPagesByOwnerId(ownerId: string) {
  const adapter = await getAdapter();
  return adapter.getPagesByOwnerId(ownerId);
}

export async function getPublicPages(limit?: number) {
  const adapter = await getAdapter();
  return adapter.getPublicPages(limit);
}

export async function updatePage(
  id: string,
  updates: { title?: string; content?: string; background?: string },
  baseServerRevision?: number
) {
  const adapter = await getAdapter();
  return adapter.updatePage(id, updates, baseServerRevision);
}

export async function publishPage(params: import('./types').PublishPageParams) {
  const adapter = await getAdapter();
  return adapter.publishPage(params);
}

export async function setPageSlug(pageId: string, slug: string) {
  const adapter = await getAdapter();
  return adapter.setPageSlug(pageId, slug);
}

export async function forkPage(sourceId: string, newOwnerId: string, newUserId?: string) {
  const adapter = await getAdapter();
  return adapter.forkPage(sourceId, newOwnerId, newUserId);
}

export async function claimAnonymousPages(anonymousId: string, userId: string) {
  const adapter = await getAdapter();
  return adapter.claimAnonymousPages(anonymousId, userId);
}

export async function createDefaultPage(userId: string, title: string) {
  const adapter = await getAdapter();
  return adapter.createDefaultPage(userId, title);
}

// =============================================================================
// Feedback Operations
// =============================================================================

export async function addFeedback(pageId: string, message: string, email?: string) {
  const adapter = await getAdapter();
  return adapter.addFeedback(pageId, message, email);
}

export async function addProductFeedback(message: string, email?: string) {
  const adapter = await getAdapter();
  return adapter.addProductFeedback(message, email);
}

// =============================================================================
// Database initialization (for server startup)
// =============================================================================

export async function initDatabase(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required in production');
    }
    const { initPostgres } = await import('./postgres');
    await initPostgres(databaseUrl);
  } else {
    console.log('✅ SQLite database initialized');
    // SQLite is already initialized on import
  }
}
