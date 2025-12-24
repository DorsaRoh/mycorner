/**
 * PostgreSQL database adapter using Drizzle ORM.
 * Used in production when DATABASE_URL is set.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq, desc, and, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import * as schema from './schema';
import type { DbUser, DbPage, DbFeedback, DbProductFeedback, PublishPageParams, PublishPageResult } from './types';

let pool: Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;
let initPromise: Promise<ReturnType<typeof drizzle>> | null = null;

export async function initPostgres(connectionString: string) {
  if (db) return db;
  
  // Configure pool for serverless environments
  // Use minimal connections to avoid exhausting database connection limits
  pool = new Pool({ 
    connectionString,
    // Serverless-friendly settings
    max: 1,                        // Only 1 connection per serverless instance
    idleTimeoutMillis: 20000,      // Close idle connections after 20s
    connectionTimeoutMillis: 10000, // Fail fast if can't connect in 10s
  });
  
  db = drizzle(pool, { schema });
  console.log('✅ PostgreSQL connected');
  
  // Ensure essential tables exist
  await ensureTablesExist();
  
  // Run one-time migrations
  await runOneTimeUsernameReset();
  
  return db;
}

/**
 * Lazily initialize PostgreSQL connection.
 * This is critical for Vercel/serverless environments where there's no server startup.
 */
async function ensureInitialized(): Promise<ReturnType<typeof drizzle>> {
  if (db) return db;
  
  // Avoid race conditions with concurrent requests
  if (initPromise) return initPromise;
  
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required for PostgreSQL');
  }
  
  initPromise = initPostgres(connectionString);
  return initPromise;
}

/**
 * Ensure essential tables exist in PostgreSQL.
 * This is a safety check in case drizzle-kit push hasn't been run yet.
 */
async function ensureTablesExist(): Promise<void> {
  // Create users table if it doesn't exist
  await pool!.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      google_sub TEXT NOT NULL UNIQUE,
      name TEXT,
      avatar_url TEXT,
      username TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  
  // Create pages table if it doesn't exist
  await pool!.query(`
    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      user_id UUID REFERENCES users(id),
      owner_id TEXT NOT NULL,
      title TEXT,
      slug TEXT UNIQUE,
      content JSONB DEFAULT '[]'::jsonb NOT NULL,
      background JSONB,
      published_content JSONB,
      published_background JSONB,
      published_at TIMESTAMP,
      published_revision INTEGER,
      is_published BOOLEAN DEFAULT false NOT NULL,
      forked_from_id TEXT,
      server_revision INTEGER DEFAULT 1 NOT NULL,
      schema_version INTEGER DEFAULT 1 NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  
  // Create product_feedback table if it doesn't exist
  await pool!.query(`
    CREATE TABLE IF NOT EXISTS product_feedback (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message TEXT NOT NULL,
      email TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  
  // Create feedback table if it doesn't exist
  await pool!.query(`
    CREATE TABLE IF NOT EXISTS feedback (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      page_id TEXT NOT NULL REFERENCES pages(id),
      message TEXT NOT NULL,
      email TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
}

/**
 * One-time migration: Clear all usernames to force re-onboarding.
 * Uses app_config table to track if migration has run.
 */
async function runOneTimeUsernameReset(): Promise<void> {
  const d = getDb();
  const MIGRATION_KEY = 'username_reset_v2';
  
  // Ensure app_config table exists
  await pool!.query(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  
  // Check if already run
  const result = await pool!.query('SELECT value FROM app_config WHERE key = $1', [MIGRATION_KEY]);
  if (result.rows.length > 0 && result.rows[0].value === 'completed') {
    return; // Already ran
  }
  
  // Run the reset
  console.log('[Migration] Running one-time username reset...');
  const updateResult = await d.update(schema.users).set({ username: null, updatedAt: new Date() });
  console.log('[Migration] Cleared usernames');
  
  // Mark as complete
  await pool!.query(`
    INSERT INTO app_config (key, value, updated_at) VALUES ($1, 'completed', NOW())
    ON CONFLICT (key) DO UPDATE SET value = 'completed', updated_at = NOW()
  `, [MIGRATION_KEY]);
  console.log('[Migration] Username reset complete - will not run again');
}

export function getDb() {
  if (!db) throw new Error('PostgreSQL not initialized');
  return db;
}

/**
 * Get database with lazy initialization for serverless environments.
 */
async function getDbLazy() {
  await ensureInitialized();
  return db!;
}

// =============================================================================
// User Operations
// =============================================================================

export async function upsertUserByGoogleSub(params: {
  googleSub: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}): Promise<DbUser> {
  const { googleSub, email, name, avatarUrl } = params;
  const d = await getDbLazy();

  // Try to find existing user
  const existing = await d.select().from(schema.users).where(eq(schema.users.googleSub, googleSub)).limit(1);

  if (existing.length > 0) {
    // Update email/name/avatar if changed
    await d.update(schema.users)
      .set({
        email: email.toLowerCase(),
        name: name || null,
        avatarUrl: avatarUrl || null,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, existing[0].id));

    const updated = await d.select().from(schema.users).where(eq(schema.users.id, existing[0].id)).limit(1);
    return mapUser(updated[0]);
  }

  // Check if email already exists (different google account)
  const byEmail = await d.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase())).limit(1);

  if (byEmail.length > 0) {
    // Link this google_sub to existing email account
    await d.update(schema.users)
      .set({
        googleSub,
        name: name || byEmail[0].name,
        avatarUrl: avatarUrl || byEmail[0].avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, byEmail[0].id));

    const updated = await d.select().from(schema.users).where(eq(schema.users.id, byEmail[0].id)).limit(1);
    return mapUser(updated[0]);
  }

  // Create new user
  const newUser = await d.insert(schema.users)
    .values({
      email: email.toLowerCase(),
      googleSub,
      name: name || null,
      avatarUrl: avatarUrl || null,
    })
    .returning();

  return mapUser(newUser[0]);
}

export async function getUserById(id: string): Promise<DbUser | null> {
  const d = await getDbLazy();
  const result = await d.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return result.length > 0 ? mapUser(result[0]) : null;
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const d = await getDbLazy();
  const result = await d.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase())).limit(1);
  return result.length > 0 ? mapUser(result[0]) : null;
}

export async function getUserByUsername(username: string): Promise<DbUser | null> {
  const d = await getDbLazy();
  const result = await d.select().from(schema.users).where(eq(schema.users.username, username.toLowerCase())).limit(1);
  return result.length > 0 ? mapUser(result[0]) : null;
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const d = await getDbLazy();
  const result = await d.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, username.toLowerCase())).limit(1);
  return result.length > 0;
}

export async function setUsername(userId: string, username: string): Promise<{ success: boolean; error?: string }> {
  const d = await getDbLazy();
  
  // validate username format (a-z, 0-9, _, -)
  const usernameRegex = /^[a-z0-9_-]{3,32}$/;
  if (!usernameRegex.test(username)) {
    return { success: false, error: 'Username must be 3-32 characters: lowercase letters, numbers, underscores, hyphens' };
  }

  if (await isUsernameTaken(username)) {
    return { success: false, error: 'Username is already taken' };
  }

  try {
    await d.update(schema.users)
      .set({ username: username.toLowerCase(), updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
    return { success: true };
  } catch {
    return { success: false, error: 'Username is already taken' };
  }
}

/**
 * set username only if user doesn't already have one.
 * used during oauth login to auto-assign username without overwriting existing.
 */
export async function setUsernameIfMissing(userId: string, username: string): Promise<{ success: boolean; error?: string; alreadySet?: boolean }> {
  // check if user already has a username
  const user = await getUserById(userId);
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

// =============================================================================
// Page Operations
// =============================================================================

export async function createPage(ownerId: string, title?: string, userId?: string): Promise<DbPage> {
  const d = await getDbLazy();
  const id = `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const newPage = await d.insert(schema.pages)
    .values({
      id,
      ownerId,
      userId: userId || null,
      title: title || null,
      content: [],
      isPublished: false,
    })
    .returning();

  return mapPage(newPage[0]);
}

export async function getPageById(id: string): Promise<DbPage | null> {
  const d = await getDbLazy();
  const result = await d.select().from(schema.pages).where(eq(schema.pages.id, id)).limit(1);
  return result.length > 0 ? mapPage(result[0]) : null;
}

export async function getPageBySlug(slug: string): Promise<DbPage | null> {
  const d = await getDbLazy();
  const result = await d.select().from(schema.pages).where(eq(schema.pages.slug, slug.toLowerCase())).limit(1);
  return result.length > 0 ? mapPage(result[0]) : null;
}

export async function getPagesByUserId(userId: string): Promise<DbPage[]> {
  const d = await getDbLazy();
  const result = await d.select().from(schema.pages).where(eq(schema.pages.userId, userId)).orderBy(desc(schema.pages.updatedAt));
  return result.map(mapPage);
}

export async function getPagesByOwnerId(ownerId: string): Promise<DbPage[]> {
  const d = await getDbLazy();
  const result = await d.select().from(schema.pages).where(eq(schema.pages.ownerId, ownerId)).orderBy(desc(schema.pages.updatedAt));
  return result.map(mapPage);
}

export async function getPublicPages(limit: number = 12): Promise<DbPage[]> {
  const d = await getDbLazy();
  const result = await d.select().from(schema.pages).where(eq(schema.pages.isPublished, true)).orderBy(desc(schema.pages.updatedAt)).limit(limit);
  return result.map(mapPage);
}

export async function updatePage(
  id: string,
  updates: { title?: string; content?: string; background?: string },
  baseServerRevision?: number
): Promise<{ page: DbPage | null; conflict: boolean }> {
  const d = await getDbLazy();
  
  const page = await getPageById(id);
  if (!page) return { page: null, conflict: false };

  // Check for conflict
  if (baseServerRevision !== undefined && baseServerRevision !== page.server_revision) {
    return { page, conflict: true };
  }

  const updateData: Record<string, unknown> = {
    serverRevision: sql`${schema.pages.serverRevision} + 1`,
    updatedAt: new Date(),
  };

  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.content !== undefined) updateData.content = JSON.parse(updates.content);
  if (updates.background !== undefined) updateData.background = JSON.parse(updates.background);

  await d.update(schema.pages).set(updateData).where(eq(schema.pages.id, id));

  const updated = await getPageById(id);
  return { page: updated, conflict: false };
}

export async function publishPage(params: PublishPageParams): Promise<PublishPageResult> {
  const d = await getDbLazy();
  const { id, content, background, baseServerRevision, slug } = params;

  const page = await getPageById(id);
  if (!page) {
    return { page: null, conflict: false, publishedRevision: null, publishedAt: null };
  }

  // Conflict detection
  if (baseServerRevision !== page.server_revision) {
    return { page, conflict: true, publishedRevision: null, publishedAt: null };
  }

  // Clear slug from other pages if provided
  if (slug) {
    await d.update(schema.pages)
      .set({ slug: null, updatedAt: new Date() })
      .where(and(eq(schema.pages.slug, slug), sql`${schema.pages.id} != ${id}`));
  }

  const publishedAt = new Date();
  const contentJson = JSON.parse(content);
  const backgroundJson = background ? JSON.parse(background) : null;

  await d.update(schema.pages)
    .set({
      content: contentJson,
      background: backgroundJson,
      publishedContent: contentJson,
      publishedBackground: backgroundJson,
      publishedAt,
      publishedRevision: page.server_revision,
      isPublished: true,
      slug: slug || null,
      updatedAt: publishedAt,
    })
    .where(eq(schema.pages.id, id));

  const updated = await getPageById(id);
  return {
    page: updated,
    conflict: false,
    publishedRevision: updated?.published_revision ?? null,
    publishedAt: updated?.published_at ?? null,
  };
}

export async function setPageSlug(pageId: string, slug: string): Promise<{ success: boolean; error?: string }> {
  const d = await getDbLazy();
  
  // Validate slug format
  const slugRegex = /^[a-z0-9_-]{1,50}$/;
  if (!slugRegex.test(slug)) {
    return { success: false, error: 'Invalid slug format' };
  }

  try {
    await d.update(schema.pages)
      .set({ slug: slug.toLowerCase(), updatedAt: new Date() })
      .where(eq(schema.pages.id, pageId));
    return { success: true };
  } catch {
    return { success: false, error: 'Slug is already taken' };
  }
}

export async function forkPage(sourceId: string, newOwnerId: string, newUserId?: string): Promise<DbPage | null> {
  const source = await getPageById(sourceId);
  if (!source || !source.is_published) return null;

  const d = await getDbLazy();
  const id = `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const title = source.title ? `${source.title} (fork)` : null;

  const contentToFork = source.published_content ? JSON.parse(source.published_content) : JSON.parse(source.content);
  const backgroundToFork = source.published_background ? JSON.parse(source.published_background) : (source.background ? JSON.parse(source.background) : null);

  const newPage = await d.insert(schema.pages)
    .values({
      id,
      ownerId: newOwnerId,
      userId: newUserId || null,
      title,
      content: contentToFork,
      background: backgroundToFork,
      isPublished: false,
      forkedFromId: sourceId,
    })
    .returning();

  return mapPage(newPage[0]);
}

export async function claimAnonymousPages(anonymousId: string, userId: string): Promise<void> {
  const d = await getDbLazy();
  await d.update(schema.pages)
    .set({ ownerId: userId, userId, updatedAt: new Date() })
    .where(and(
      eq(schema.pages.ownerId, anonymousId),
      eq(schema.pages.isPublished, false),
      sql`${schema.pages.userId} IS NULL`
    ));
}

/**
 * Reset draft content to match published content for all of a user's published pages.
 * Called after login to ensure the edit page shows the published state, not stale drafts.
 * This ensures users see their published page when signing back in after logout.
 */
export async function resetDraftToPublished(userId: string): Promise<number> {
  const d = await getDbLazy();
  
  // Drizzle doesn't support SET column = other_column directly,
  // so we use raw SQL for this update
  const result = await pool!.query(`
    UPDATE pages 
    SET 
      content = published_content,
      background = published_background,
      updated_at = NOW()
    WHERE user_id = $1 
      AND is_published = true 
      AND published_content IS NOT NULL
  `, [userId]);
  
  return result.rowCount || 0;
}

export async function createDefaultPage(userId: string, title: string): Promise<DbPage> {
  return createPage(userId, title, userId);
}

// =============================================================================
// Feedback Operations
// =============================================================================

export async function addFeedback(pageId: string, message: string, email?: string): Promise<DbFeedback> {
  const d = await getDbLazy();
  const result = await d.insert(schema.feedback)
    .values({ pageId, message, email: email || null })
    .returning();
  
  return {
    id: result[0].id,
    page_id: result[0].pageId,
    message: result[0].message,
    email: result[0].email,
    created_at: result[0].createdAt.toISOString(),
  };
}

export async function addProductFeedback(message: string, email?: string): Promise<DbProductFeedback> {
  const d = await getDbLazy();
  const result = await d.insert(schema.productFeedback)
    .values({ message, email: email || null })
    .returning();

  return {
    id: result[0].id,
    message: result[0].message,
    email: result[0].email,
    created_at: result[0].createdAt.toISOString(),
  };
}

// =============================================================================
// Mappers (convert Drizzle types to legacy types for compatibility)
// =============================================================================

function mapUser(u: schema.User): DbUser {
  return {
    id: u.id,
    email: u.email,
    google_sub: u.googleSub,
    name: u.name,
    avatar_url: u.avatarUrl,
    username: u.username,
    created_at: u.createdAt.toISOString(),
    updated_at: u.updatedAt.toISOString(),
  };
}

function mapPage(p: schema.Page): DbPage {
  return {
    id: p.id,
    user_id: p.userId,
    owner_id: p.ownerId,
    title: p.title,
    slug: p.slug,
    content: JSON.stringify(p.content),
    background: p.background ? JSON.stringify(p.background) : null,
    published_content: p.publishedContent ? JSON.stringify(p.publishedContent) : null,
    published_background: p.publishedBackground ? JSON.stringify(p.publishedBackground) : null,
    published_at: p.publishedAt?.toISOString() ?? null,
    published_revision: p.publishedRevision,
    is_published: p.isPublished ? 1 : 0,
    forked_from_id: p.forkedFromId,
    server_revision: p.serverRevision,
    schema_version: p.schemaVersion,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  };
}

