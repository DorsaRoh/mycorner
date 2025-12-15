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

export function initPostgres(connectionString: string) {
  pool = new Pool({ connectionString });
  db = drizzle(pool, { schema });
  console.log('✅ PostgreSQL connected');
  return db;
}

export function getDb() {
  if (!db) throw new Error('PostgreSQL not initialized');
  return db;
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
  const d = getDb();

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
  const d = getDb();
  const result = await d.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return result.length > 0 ? mapUser(result[0]) : null;
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const d = getDb();
  const result = await d.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase())).limit(1);
  return result.length > 0 ? mapUser(result[0]) : null;
}

export async function getUserByUsername(username: string): Promise<DbUser | null> {
  const d = getDb();
  const result = await d.select().from(schema.users).where(eq(schema.users.username, username.toLowerCase())).limit(1);
  return result.length > 0 ? mapUser(result[0]) : null;
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const d = getDb();
  const result = await d.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, username.toLowerCase())).limit(1);
  return result.length > 0;
}

export async function setUsername(userId: string, username: string): Promise<{ success: boolean; error?: string }> {
  const d = getDb();
  
  const usernameRegex = /^[a-z0-9_]{3,20}$/;
  if (!usernameRegex.test(username)) {
    return { success: false, error: 'Username must be 3-20 characters, lowercase letters, numbers, and underscores only' };
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

// =============================================================================
// Page Operations
// =============================================================================

export async function createPage(ownerId: string, title?: string, userId?: string): Promise<DbPage> {
  const d = getDb();
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
  const d = getDb();
  const result = await d.select().from(schema.pages).where(eq(schema.pages.id, id)).limit(1);
  return result.length > 0 ? mapPage(result[0]) : null;
}

export async function getPageBySlug(slug: string): Promise<DbPage | null> {
  const d = getDb();
  const result = await d.select().from(schema.pages).where(eq(schema.pages.slug, slug.toLowerCase())).limit(1);
  return result.length > 0 ? mapPage(result[0]) : null;
}

export async function getPagesByUserId(userId: string): Promise<DbPage[]> {
  const d = getDb();
  const result = await d.select().from(schema.pages).where(eq(schema.pages.userId, userId)).orderBy(desc(schema.pages.updatedAt));
  return result.map(mapPage);
}

export async function getPagesByOwnerId(ownerId: string): Promise<DbPage[]> {
  const d = getDb();
  const result = await d.select().from(schema.pages).where(eq(schema.pages.ownerId, ownerId)).orderBy(desc(schema.pages.updatedAt));
  return result.map(mapPage);
}

export async function getPublicPages(limit: number = 12): Promise<DbPage[]> {
  const d = getDb();
  const result = await d.select().from(schema.pages).where(eq(schema.pages.isPublished, true)).orderBy(desc(schema.pages.updatedAt)).limit(limit);
  return result.map(mapPage);
}

export async function updatePage(
  id: string,
  updates: { title?: string; content?: string; background?: string },
  baseServerRevision?: number
): Promise<{ page: DbPage | null; conflict: boolean }> {
  const d = getDb();
  
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
  const d = getDb();
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

export async function forkPage(sourceId: string, newOwnerId: string, newUserId?: string): Promise<DbPage | null> {
  const source = await getPageById(sourceId);
  if (!source || !source.is_published) return null;

  const d = getDb();
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
  const d = getDb();
  await d.update(schema.pages)
    .set({ ownerId: userId, userId, updatedAt: new Date() })
    .where(and(
      eq(schema.pages.ownerId, anonymousId),
      eq(schema.pages.isPublished, false),
      sql`${schema.pages.userId} IS NULL`
    ));
}

export async function createDefaultPage(userId: string, title: string): Promise<DbPage> {
  return createPage(userId, title, userId);
}

// =============================================================================
// Feedback Operations
// =============================================================================

export async function addFeedback(pageId: string, message: string, email?: string): Promise<DbFeedback> {
  const d = getDb();
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
  const d = getDb();
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

