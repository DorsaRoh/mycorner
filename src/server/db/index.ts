/**
 * Database facade - switches between SQLite (dev) and PostgreSQL (prod).
 * 
 * This module re-exports database operations from the appropriate adapter
 * based on environment configuration.
 */

import { getConfig } from '../../lib/config';

// Re-export types
export type { DbUser, DbPage, DbFeedback, DbProductFeedback, PublishPageParams, PublishPageResult } from './types';

// Determine which adapter to use at module load time
const config = getConfig();

// In development or when USE_SQLITE is true, use SQLite
// Otherwise, use PostgreSQL
const useSqlite = config.useSqlite;

// Dynamic import based on config
// We use require here for synchronous loading (SQLite operations are sync)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const adapter = useSqlite 
  ? require('./sqlite') 
  : require('./postgres');

// =============================================================================
// User Operations (re-exported from adapter)
// =============================================================================

export const upsertUserByGoogleSub: typeof import('./sqlite').upsertUserByGoogleSub = 
  useSqlite ? adapter.upsertUserByGoogleSub : wrapAsync(adapter.upsertUserByGoogleSub);

export const getUserById: typeof import('./sqlite').getUserById = 
  useSqlite ? adapter.getUserById : wrapAsync(adapter.getUserById);

export const getUserByEmail: typeof import('./sqlite').getUserByEmail = 
  useSqlite ? adapter.getUserByEmail : wrapAsync(adapter.getUserByEmail);

export const getUserByUsername: typeof import('./sqlite').getUserByUsername = 
  useSqlite ? adapter.getUserByUsername : wrapAsync(adapter.getUserByUsername);

export const isUsernameTaken: typeof import('./sqlite').isUsernameTaken = 
  useSqlite ? adapter.isUsernameTaken : wrapAsync(adapter.isUsernameTaken);

export const setUsername: typeof import('./sqlite').setUsername = 
  useSqlite ? adapter.setUsername : wrapAsync(adapter.setUsername);

// =============================================================================
// Page Operations (re-exported from adapter)
// =============================================================================

export const createPage: typeof import('./sqlite').createPage = 
  useSqlite ? adapter.createPage : wrapAsync(adapter.createPage);

export const getPageById: typeof import('./sqlite').getPageById = 
  useSqlite ? adapter.getPageById : wrapAsync(adapter.getPageById);

export const getPageBySlug: typeof import('./sqlite').getPageBySlug = 
  useSqlite ? adapter.getPageBySlug : wrapAsync(adapter.getPageBySlug);

export const getPagesByUserId: typeof import('./sqlite').getPagesByUserId = 
  useSqlite ? adapter.getPagesByUserId : wrapAsync(adapter.getPagesByUserId);

export const getPagesByOwnerId: typeof import('./sqlite').getPagesByOwnerId = 
  useSqlite ? adapter.getPagesByOwnerId : wrapAsync(adapter.getPagesByOwnerId);

export const getPublicPages: typeof import('./sqlite').getPublicPages = 
  useSqlite ? adapter.getPublicPages : wrapAsync(adapter.getPublicPages);

export const updatePage: typeof import('./sqlite').updatePage = 
  useSqlite ? adapter.updatePage : wrapAsync(adapter.updatePage);

export const publishPage: typeof import('./sqlite').publishPage = 
  useSqlite ? adapter.publishPage : wrapAsync(adapter.publishPage);

export const setPageSlug: typeof import('./sqlite').setPageSlug = 
  useSqlite ? adapter.setPageSlug : wrapAsync(adapter.setPageSlug);

export const forkPage: typeof import('./sqlite').forkPage = 
  useSqlite ? adapter.forkPage : wrapAsync(adapter.forkPage);

export const claimAnonymousPages: typeof import('./sqlite').claimAnonymousPages = 
  useSqlite ? adapter.claimAnonymousPages : wrapAsync(adapter.claimAnonymousPages);

export const createDefaultPage: typeof import('./sqlite').createDefaultPage = 
  useSqlite ? adapter.createDefaultPage : wrapAsync(adapter.createDefaultPage);

// =============================================================================
// Feedback Operations (re-exported from adapter)
// =============================================================================

export const addFeedback: typeof import('./sqlite').addFeedback = 
  useSqlite ? adapter.addFeedback : wrapAsync(adapter.addFeedback);

export const addProductFeedback: typeof import('./sqlite').addProductFeedback = 
  useSqlite ? adapter.addProductFeedback : wrapAsync(adapter.addProductFeedback);

// =============================================================================
// Database initialization
// =============================================================================

export async function initDatabase(): Promise<void> {
  if (useSqlite) {
    console.log('✅ SQLite database initialized');
    // SQLite is already initialized on require
  } else {
    // Initialize PostgreSQL connection
    const { initPostgres } = await import('./postgres');
    initPostgres(config.databaseUrl);
  }
}

// =============================================================================
// Helper to wrap async functions for consistent interface
// =============================================================================

// Note: In production (PostgreSQL), operations are async.
// In development (SQLite), operations are sync.
// The resolvers handle both cases by awaiting results (await on sync just returns the value).

function wrapAsync<T extends (...args: unknown[]) => unknown>(fn: T): T {
  // PostgreSQL operations are already async, just return them
  return fn;
}
