/**
 * Test database utilities.
 * 
 * Provides helpers for seeding test data and managing test database state.
 */

import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// Types
// =============================================================================

export interface TestUser {
  id: string;
  email: string;
  googleSub: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
}

export interface TestPage {
  id: string;
  userId: string | null;
  ownerId: string;
  title: string | null;
  slug: string | null;
  content: string;
  isPublished: boolean;
  serverRevision: number;
}

export interface SeedData {
  users: TestUser[];
  pages: TestPage[];
}

// =============================================================================
// Test Data Factory
// =============================================================================

let userCounter = 0;
let pageCounter = 0;

/**
 * Create a test user with unique attributes.
 */
export function createTestUser(overrides: Partial<TestUser> = {}): TestUser {
  userCounter++;
  const id = overrides.id || uuidv4();
  return {
    id,
    email: overrides.email || `testuser${userCounter}@example.com`,
    googleSub: overrides.googleSub || `google-sub-${userCounter}`,
    name: overrides.name || `Test User ${userCounter}`,
    username: overrides.username ?? `testuser${userCounter}`,
    avatarUrl: overrides.avatarUrl ?? null,
  };
}

/**
 * Create a test page with unique attributes.
 */
export function createTestPage(
  owner: TestUser,
  overrides: Partial<Omit<TestPage, 'ownerId'>> = {}
): TestPage {
  pageCounter++;
  const id = overrides.id || `page_test_${pageCounter}`;
  return {
    id,
    userId: overrides.userId !== undefined ? overrides.userId : owner.id,
    ownerId: owner.id,
    title: overrides.title ?? `Test Page ${pageCounter}`,
    slug: overrides.slug ?? null,
    content: overrides.content ?? JSON.stringify({
      version: 1,
      blocks: [
        {
          id: `blk_test_${pageCounter}`,
          type: 'text',
          x: 100,
          y: 100,
          width: 200,
          height: 50,
          content: { text: 'Test content' },
        },
      ],
    }),
    isPublished: overrides.isPublished ?? false,
    serverRevision: overrides.serverRevision ?? 1,
  };
}

/**
 * Create a draft page owned by an anonymous token.
 */
export function createAnonymousTestPage(
  anonToken: string,
  overrides: Partial<Omit<TestPage, 'ownerId' | 'userId'>> = {}
): TestPage {
  pageCounter++;
  const id = overrides.id || `page_anon_${pageCounter}`;
  return {
    id,
    userId: null,
    ownerId: anonToken,
    title: overrides.title ?? `Anonymous Draft ${pageCounter}`,
    slug: null,
    content: overrides.content ?? JSON.stringify({
      version: 1,
      blocks: [
        {
          id: `blk_anon_${pageCounter}`,
          type: 'text',
          x: 100,
          y: 100,
          width: 200,
          height: 50,
          content: { text: 'Anonymous draft content' },
        },
      ],
    }),
    isPublished: false,
    serverRevision: overrides.serverRevision ?? 1,
  };
}

/**
 * Generate a unique anonymous token.
 */
export function generateAnonToken(): string {
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 18)}`;
}

// =============================================================================
// Database Seeding
// =============================================================================

/**
 * Seed the test database with users and pages.
 * Must be called after db module is imported.
 */
export async function seedTestData(data: Partial<SeedData> = {}): Promise<SeedData> {
  // Dynamic import to ensure test env is set first
  const db = await import('@/server/db/sqlite');
  
  const users: TestUser[] = [];
  const pages: TestPage[] = [];
  
  // Seed users
  for (const userData of data.users || []) {
    const user = db.upsertUserByGoogleSub({
      googleSub: userData.googleSub,
      email: userData.email,
      name: userData.name,
      avatarUrl: userData.avatarUrl || undefined,
    });
    
    // Set username if provided
    if (userData.username) {
      db.setUsername(user.id, userData.username);
    }
    
    users.push({
      ...userData,
      id: user.id,
    });
  }
  
  // Seed pages
  for (const pageData of data.pages || []) {
    const page = db.createPage(
      pageData.ownerId,
      pageData.title || undefined,
      pageData.userId || undefined
    );
    
    // Update content
    db.updatePage(page.id, {
      content: pageData.content,
    });
    
    // Publish if needed
    if (pageData.isPublished && pageData.slug) {
      db.publishPage({
        id: page.id,
        content: pageData.content,
        baseServerRevision: page.server_revision,
        slug: pageData.slug,
      });
    }
    
    pages.push({
      ...pageData,
      id: page.id,
    });
  }
  
  return { users, pages };
}

/**
 * Clear all data from the test database.
 */
export async function clearTestData(): Promise<void> {
  const db = await import('@/server/db/sqlite');
  
  // Use raw SQL to clear tables
  db.db.exec(`
    DELETE FROM feedback;
    DELETE FROM product_feedback;
    DELETE FROM pages;
    DELETE FROM users;
    DELETE FROM app_config WHERE key != 'username_reset_v1';
  `);
}

/**
 * Reset test counters (useful between test files).
 */
export function resetCounters(): void {
  userCounter = 0;
  pageCounter = 0;
}

