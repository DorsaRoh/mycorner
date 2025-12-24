/**
 * SQLite database module with proper schema for users and pages.
 * Uses better-sqlite3 for synchronous, fast SQLite access.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Database file location
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'my-corner.db');

// Ensure data directory exists
import fs from 'fs';
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    google_sub TEXT UNIQUE NOT NULL,
    name TEXT,
    avatar_url TEXT,
    username TEXT UNIQUE,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Index for fast lookups
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

  -- Pages table
  CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    owner_id TEXT NOT NULL,
    title TEXT,
    slug TEXT UNIQUE,
    content TEXT DEFAULT '[]',
    background TEXT,
    published_content TEXT,
    published_background TEXT,
    published_at TEXT,
    published_revision INTEGER,
    is_published INTEGER DEFAULT 0,
    forked_from_id TEXT,
    server_revision INTEGER DEFAULT 1,
    schema_version INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (forked_from_id) REFERENCES pages(id)
  );

  -- Index for fast lookups
  CREATE INDEX IF NOT EXISTS idx_pages_user_id ON pages(user_id);
  CREATE INDEX IF NOT EXISTS idx_pages_owner_id ON pages(owner_id);
  CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug);
  CREATE INDEX IF NOT EXISTS idx_pages_is_published ON pages(is_published);

  -- Migration: Add published content fields if they don't exist
  -- SQLite doesn't have IF NOT EXISTS for columns, so we check pragma
`);

// Migration: Add published_content columns if they don't exist
const tableInfo = db.pragma('table_info(pages)') as { name: string }[];
const columnNames = new Set(tableInfo.map(col => col.name));

if (!columnNames.has('published_content')) {
  db.exec(`ALTER TABLE pages ADD COLUMN published_content TEXT`);
}
if (!columnNames.has('published_background')) {
  db.exec(`ALTER TABLE pages ADD COLUMN published_background TEXT`);
}
if (!columnNames.has('published_at')) {
  db.exec(`ALTER TABLE pages ADD COLUMN published_at TEXT`);
}
if (!columnNames.has('published_revision')) {
  db.exec(`ALTER TABLE pages ADD COLUMN published_revision INTEGER`);
}

db.exec(`

  -- Feedback table
  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL,
    message TEXT NOT NULL,
    email TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (page_id) REFERENCES pages(id)
  );

  -- Product feedback table
  CREATE TABLE IF NOT EXISTS product_feedback (
    id TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    email TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- App config table for one-time migrations
  CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// =============================================================================
// One-time username reset migration
// =============================================================================

/**
 * Clear all usernames once to force re-onboarding.
 * This runs once and never again (tracked via app_config).
 */
function runOneTimeUsernameReset(): void {
  const MIGRATION_KEY = 'username_reset_v1';
  
  // Check if already run
  const existing = db.prepare(`SELECT value FROM app_config WHERE key = ?`).get(MIGRATION_KEY) as { value: string } | undefined;
  if (existing?.value === 'completed') {
    return; // Already ran
  }
  
  // Run the reset
  console.log('[Migration] Running one-time username reset...');
  const result = db.prepare(`UPDATE users SET username = NULL, updated_at = datetime('now')`).run();
  console.log(`[Migration] Cleared ${result.changes} usernames`);
  
  // Mark as complete
  db.prepare(`
    INSERT OR REPLACE INTO app_config (key, value, updated_at) 
    VALUES (?, 'completed', datetime('now'))
  `).run(MIGRATION_KEY);
  console.log('[Migration] Username reset complete - will not run again');
}

// Run the migration on module load
runOneTimeUsernameReset();

// ============================================================================
// Types (imported from shared types file)
// ============================================================================

import type { DbUser, DbPage, DbFeedback, DbProductFeedback, PublishPageParams, PublishPageResult } from './types';
export type { DbUser, DbPage, DbFeedback, DbProductFeedback, PublishPageParams, PublishPageResult };

// ============================================================================
// User Operations
// ============================================================================

/**
 * Find or create user by Google sub (stable account identifier).
 * This is the main auth entry point.
 */
export function upsertUserByGoogleSub(params: {
  googleSub: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}): DbUser {
  const { googleSub, email, name, avatarUrl } = params;

  // Try to find existing user
  const existing = db.prepare(`
    SELECT * FROM users WHERE google_sub = ?
  `).get(googleSub) as DbUser | undefined;

  if (existing) {
    // Update email/name/avatar if changed
    db.prepare(`
      UPDATE users 
      SET email = ?, name = ?, avatar_url = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(email.toLowerCase(), name || null, avatarUrl || null, existing.id);

    return getUserById(existing.id)!;
  }

  // Check if email already exists (different google account)
  const byEmail = db.prepare(`
    SELECT * FROM users WHERE email = ?
  `).get(email.toLowerCase()) as DbUser | undefined;

  if (byEmail) {
    // Link this google_sub to existing email account
    db.prepare(`
      UPDATE users 
      SET google_sub = ?, name = COALESCE(?, name), avatar_url = COALESCE(?, avatar_url), updated_at = datetime('now')
      WHERE id = ?
    `).run(googleSub, name || null, avatarUrl || null, byEmail.id);

    return getUserById(byEmail.id)!;
  }

  // Create new user
  const id = uuidv4();
  db.prepare(`
    INSERT INTO users (id, email, google_sub, name, avatar_url)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, email.toLowerCase(), googleSub, name || null, avatarUrl || null);

  return getUserById(id)!;
}

export function getUserById(id: string): DbUser | null {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as DbUser | undefined;
  return user || null;
}

export function getUserByEmail(email: string): DbUser | null {
  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase()) as DbUser | undefined;
  return user || null;
}

export function getUserByUsername(username: string): DbUser | null {
  const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username.toLowerCase()) as DbUser | undefined;
  return user || null;
}

export function isUsernameTaken(username: string): boolean {
  const row = db.prepare(`SELECT 1 FROM users WHERE username = ?`).get(username.toLowerCase());
  return !!row;
}

export function setUsername(userId: string, username: string): { success: boolean; error?: string } {
  // validate username format (a-z, 0-9, _, -)
  const usernameRegex = /^[a-z0-9_-]{3,32}$/;
  if (!usernameRegex.test(username)) {
    return { success: false, error: 'Username must be 3-32 characters: lowercase letters, numbers, underscores, hyphens' };
  }

  // check if taken
  if (isUsernameTaken(username)) {
    return { success: false, error: 'Username is already taken' };
  }

  try {
    db.prepare(`
      UPDATE users SET username = ?, updated_at = datetime('now') WHERE id = ?
    `).run(username.toLowerCase(), userId);
    return { success: true };
  } catch (err) {
    // unique constraint violation (race condition)
    return { success: false, error: 'Username is already taken' };
  }
}

/**
 * set username only if user doesn't already have one.
 * used during oauth login to auto-assign username without overwriting existing.
 */
export function setUsernameIfMissing(userId: string, username: string): { success: boolean; error?: string; alreadySet?: boolean } {
  // check if user already has a username
  const user = getUserById(userId);
  if (!user) {
    return { success: false, error: 'User not found' };
  }
  
  if (user.username) {
    // already has username, no action needed
    return { success: true, alreadySet: true };
  }
  
  // set the username
  return setUsername(userId, username);
}

// ============================================================================
// Page Operations
// ============================================================================

export function createPage(ownerId: string, title?: string, userId?: string): DbPage {
  const id = `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  db.prepare(`
    INSERT INTO pages (id, owner_id, user_id, title, content, is_published)
    VALUES (?, ?, ?, ?, '[]', 0)
  `).run(id, ownerId, userId || null, title || null);

  return getPageById(id)!;
}

export function getPageById(id: string): DbPage | null {
  const page = db.prepare(`SELECT * FROM pages WHERE id = ?`).get(id) as DbPage | undefined;
  return page || null;
}

export function getPageBySlug(slug: string): DbPage | null {
  const page = db.prepare(`SELECT * FROM pages WHERE slug = ?`).get(slug.toLowerCase()) as DbPage | undefined;
  return page || null;
}

export function getPagesByUserId(userId: string): DbPage[] {
  return db.prepare(`SELECT * FROM pages WHERE user_id = ? ORDER BY updated_at DESC`).all(userId) as DbPage[];
}

export function getPagesByOwnerId(ownerId: string): DbPage[] {
  return db.prepare(`SELECT * FROM pages WHERE owner_id = ? ORDER BY updated_at DESC`).all(ownerId) as DbPage[];
}

export function getPublicPages(limit: number = 12): DbPage[] {
  return db.prepare(`
    SELECT * FROM pages WHERE is_published = 1 ORDER BY updated_at DESC LIMIT ?
  `).all(limit) as DbPage[];
}

export function updatePage(
  id: string,
  updates: { title?: string; content?: string; background?: string },
  baseServerRevision?: number
): { page: DbPage | null; conflict: boolean } {
  const page = getPageById(id);
  if (!page) return { page: null, conflict: false };

  // Check for conflict
  if (baseServerRevision !== undefined && baseServerRevision !== page.server_revision) {
    return { page, conflict: true };
  }

  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.title !== undefined) {
    sets.push('title = ?');
    values.push(updates.title);
  }
  if (updates.content !== undefined) {
    sets.push('content = ?');
    values.push(updates.content);
  }
  if (updates.background !== undefined) {
    sets.push('background = ?');
    values.push(updates.background);
  }

  sets.push('server_revision = server_revision + 1');
  sets.push("updated_at = datetime('now')");

  values.push(id);

  db.prepare(`UPDATE pages SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  return { page: getPageById(id), conflict: false };
}

/**
 * Publish a page by snapshotting the provided content.
 * This ensures the published version exactly matches what the client sent.
 * Validates baseServerRevision to prevent publishing stale content.
 */
export function publishPage(params: PublishPageParams): PublishPageResult {
  const { id, content, background, baseServerRevision, slug } = params;
  
  const page = getPageById(id);
  if (!page) {
    return { page: null, conflict: false, publishedRevision: null, publishedAt: null };
  }

  // Conflict detection: reject if client's base revision doesn't match server
  // This prevents publishing stale content if saves happened in between
  if (baseServerRevision !== page.server_revision) {
    return {
      page,
      conflict: true,
      publishedRevision: null,
      publishedAt: null,
    };
  }

  // If a slug is provided, clear it from any existing pages first
  // This allows the new page to take over the username-based URL
  if (slug) {
    db.prepare(`
      UPDATE pages 
      SET slug = NULL, updated_at = datetime('now')
      WHERE slug = ? AND id != ?
    `).run(slug, id);
  }

  const publishedAt = new Date().toISOString();

  // Atomically update:
  // 1. Also update content/background (to ensure they're in sync)
  // 2. Snapshot to published_content/published_background
  // 3. Set published_at and published_revision
  // 4. Set is_published = 1
  db.prepare(`
    UPDATE pages 
    SET 
      content = ?,
      background = ?,
      published_content = ?,
      published_background = ?,
      published_at = ?,
      published_revision = server_revision,
      is_published = 1,
      slug = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    content,
    background || null,
    content,
    background || null,
    publishedAt,
    slug || null,
    id
  );

  const updatedPage = getPageById(id);
  return {
    page: updatedPage,
    conflict: false,
    publishedRevision: updatedPage?.published_revision ?? null,
    publishedAt: updatedPage?.published_at ?? null,
  };
}

export function setPageSlug(pageId: string, slug: string): { success: boolean; error?: string } {
  // Validate slug format
  const slugRegex = /^[a-z0-9_-]{1,50}$/;
  if (!slugRegex.test(slug)) {
    return { success: false, error: 'Invalid slug format' };
  }

  try {
    db.prepare(`
      UPDATE pages SET slug = ?, updated_at = datetime('now') WHERE id = ?
    `).run(slug.toLowerCase(), pageId);
    return { success: true };
  } catch (err) {
    return { success: false, error: 'Slug is already taken' };
  }
}

export function forkPage(sourceId: string, newOwnerId: string, newUserId?: string): DbPage | null {
  const source = getPageById(sourceId);
  if (!source || !source.is_published) return null;

  const id = `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const title = source.title ? `${source.title} (fork)` : null;

  // Fork from published_content (not draft content) to get the public version
  const contentToFork = source.published_content || source.content;
  const backgroundToFork = source.published_background || source.background;

  db.prepare(`
    INSERT INTO pages (id, owner_id, user_id, title, content, background, is_published, forked_from_id)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(id, newOwnerId, newUserId || null, title, contentToFork, backgroundToFork, sourceId);

  return getPageById(id);
}

export function claimAnonymousPages(anonymousId: string, userId: string): void {
  db.prepare(`
    UPDATE pages 
    SET owner_id = ?, user_id = ?, updated_at = datetime('now')
    WHERE owner_id = ? AND is_published = 0 AND user_id IS NULL
  `).run(userId, userId, anonymousId);
}

/**
 * Reset draft content to match published content for all of a user's published pages.
 * Called after login to ensure the edit page shows the published state, not stale drafts.
 * This ensures users see their published page when signing back in after logout.
 */
export function resetDraftToPublished(userId: string): number {
  const result = db.prepare(`
    UPDATE pages 
    SET 
      content = published_content,
      background = published_background,
      updated_at = datetime('now')
    WHERE user_id = ? 
      AND is_published = 1 
      AND published_content IS NOT NULL
  `).run(userId);
  
  return result.changes;
}

export function createDefaultPage(userId: string, title: string): DbPage {
  const id = `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  db.prepare(`
    INSERT INTO pages (id, owner_id, user_id, title, content, is_published)
    VALUES (?, ?, ?, ?, '[]', 0)
  `).run(id, userId, userId, title);

  return getPageById(id)!;
}

// ============================================================================
// Feedback Operations
// ============================================================================

export function addFeedback(pageId: string, message: string, email?: string): DbFeedback {
  const id = uuidv4();
  
  db.prepare(`
    INSERT INTO feedback (id, page_id, message, email)
    VALUES (?, ?, ?, ?)
  `).run(id, pageId, message, email || null);

  return db.prepare(`SELECT * FROM feedback WHERE id = ?`).get(id) as DbFeedback;
}

export function addProductFeedback(message: string, email?: string): DbProductFeedback {
  const id = uuidv4();

  db.prepare(`
    INSERT INTO product_feedback (id, message, email)
    VALUES (?, ?, ?)
  `).run(id, message, email || null);

  return db.prepare(`SELECT * FROM product_feedback WHERE id = ?`).get(id) as DbProductFeedback;
}

// ============================================================================
// Export database for direct access if needed
// ============================================================================

export { db };

