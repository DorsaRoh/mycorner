/**
 * Unit tests for database operations.
 * 
 * Tests the SQLite database module functions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  clearTestData,
  resetCounters,
  generateAnonToken,
} from '../../utils/testDb';

describe('Database Module', () => {
  beforeEach(async () => {
    resetCounters();
    await clearTestData();
  });

  afterEach(async () => {
    await clearTestData();
  });

  describe('User Operations', () => {
    it('upsertUserByGoogleSub creates new user', async () => {
      const db = await import('@/server/db/sqlite');
      
      const user = db.upsertUserByGoogleSub({
        googleSub: 'test-google-sub',
        email: 'test@example.com',
        name: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
      });
      
      expect(user.id).toBeTruthy();
      expect(user.email).toBe('test@example.com');
      expect(user.google_sub).toBe('test-google-sub');
      expect(user.name).toBe('Test User');
    });

    it('upsertUserByGoogleSub updates existing user', async () => {
      const db = await import('@/server/db/sqlite');
      
      // Create user
      const user1 = db.upsertUserByGoogleSub({
        googleSub: 'test-google-sub',
        email: 'test@example.com',
        name: 'Original Name',
      });
      
      // Update user
      const user2 = db.upsertUserByGoogleSub({
        googleSub: 'test-google-sub',
        email: 'newemail@example.com',
        name: 'New Name',
      });
      
      expect(user2.id).toBe(user1.id);
      expect(user2.name).toBe('New Name');
      expect(user2.email).toBe('newemail@example.com');
    });

    it('getUserById returns user', async () => {
      const db = await import('@/server/db/sqlite');
      
      const created = db.upsertUserByGoogleSub({
        googleSub: 'test-google-sub',
        email: 'test@example.com',
        name: 'Test User',
      });
      
      const fetched = db.getUserById(created.id);
      
      expect(fetched).toBeTruthy();
      expect(fetched!.email).toBe('test@example.com');
    });

    it('getUserById returns null for non-existent user', async () => {
      const db = await import('@/server/db/sqlite');
      
      const user = db.getUserById('non-existent-id');
      
      expect(user).toBeNull();
    });

    it('setUsername validates format', async () => {
      const db = await import('@/server/db/sqlite');
      
      const user = db.upsertUserByGoogleSub({
        googleSub: 'test-google-sub',
        email: 'test@example.com',
        name: 'Test User',
      });
      
      // Too short
      const result1 = db.setUsername(user.id, 'ab');
      expect(result1.success).toBe(false);
      expect(result1.error).toContain('3-32 characters');
      
      // Valid
      const result2 = db.setUsername(user.id, 'validuser');
      expect(result2.success).toBe(true);
      
      // Verify
      const updated = db.getUserById(user.id);
      expect(updated!.username).toBe('validuser');
    });

    it('isUsernameTaken checks correctly', async () => {
      const db = await import('@/server/db/sqlite');
      
      const user = db.upsertUserByGoogleSub({
        googleSub: 'test-google-sub',
        email: 'test@example.com',
        name: 'Test User',
      });
      
      db.setUsername(user.id, 'takenname');
      
      expect(db.isUsernameTaken('takenname')).toBe(true);
      expect(db.isUsernameTaken('availablename')).toBe(false);
    });
  });

  describe('Page Operations', () => {
    it('createPage creates a new page', async () => {
      const db = await import('@/server/db/sqlite');
      
      const page = db.createPage('owner-123', 'Test Page', 'user-123');
      
      expect(page.id).toBeTruthy();
      expect(page.owner_id).toBe('owner-123');
      expect(page.user_id).toBe('user-123');
      expect(page.title).toBe('Test Page');
      expect(page.server_revision).toBe(1);
      expect(page.is_published).toBe(0);
    });

    it('updatePage updates content and increments revision', async () => {
      const db = await import('@/server/db/sqlite');
      
      const page = db.createPage('owner-123', 'Test Page');
      const originalRevision = page.server_revision;
      
      const result = db.updatePage(page.id, {
        content: JSON.stringify([{ id: 'block1', type: 'text' }]),
      });
      
      expect(result.conflict).toBe(false);
      expect(result.page!.server_revision).toBe(originalRevision + 1);
    });

    it('updatePage detects conflicts', async () => {
      const db = await import('@/server/db/sqlite');
      
      const page = db.createPage('owner-123', 'Test Page');
      
      // First update
      db.updatePage(page.id, { content: 'update1' });
      
      // Try to update with stale revision
      const result = db.updatePage(
        page.id,
        { content: 'update2' },
        page.server_revision // This is now stale
      );
      
      expect(result.conflict).toBe(true);
    });

    it('publishPage creates snapshot', async () => {
      const db = await import('@/server/db/sqlite');
      
      const user = db.upsertUserByGoogleSub({
        googleSub: 'test-sub',
        email: 'test@example.com',
        name: 'Test',
      });
      
      db.setUsername(user.id, 'testuser');
      
      const page = db.createPage(user.id, 'Test Page', user.id);
      const content = JSON.stringify({
        version: 1,
        blocks: [{ id: 'blk1', type: 'text', content: { text: 'Hello' } }],
      });
      
      db.updatePage(page.id, { content });
      
      const updatedPage = db.getPageById(page.id);
      
      const result = db.publishPage({
        id: page.id,
        content,
        baseServerRevision: updatedPage!.server_revision,
        slug: 'testuser',
      });
      
      expect(result.conflict).toBe(false);
      expect(result.page!.is_published).toBe(1);
      expect(result.page!.slug).toBe('testuser');
      expect(result.page!.published_content).toBe(content);
      expect(result.page!.published_at).toBeTruthy();
    });

    it('publishPage detects conflicts', async () => {
      const db = await import('@/server/db/sqlite');
      
      const page = db.createPage('owner-123', 'Test Page');
      
      // Update page
      db.updatePage(page.id, { content: 'updated' });
      
      // Try to publish with stale revision
      const result = db.publishPage({
        id: page.id,
        content: 'publish content',
        baseServerRevision: 1, // Stale
        slug: 'testslug',
      });
      
      expect(result.conflict).toBe(true);
    });

    it('getPageBySlug finds published page', async () => {
      const db = await import('@/server/db/sqlite');
      
      const page = db.createPage('owner-123', 'Test Page');
      
      db.publishPage({
        id: page.id,
        content: JSON.stringify({ blocks: [] }),
        baseServerRevision: 1,
        slug: 'myslug',
      });
      
      const found = db.getPageBySlug('myslug');
      
      expect(found).toBeTruthy();
      expect(found!.id).toBe(page.id);
    });

    it('claimAnonymousPages transfers ownership', async () => {
      const db = await import('@/server/db/sqlite');
      
      const anonToken = generateAnonToken();
      
      // Create anonymous page
      const page = db.createPage(anonToken, 'Anonymous Draft');
      expect(page.user_id).toBeNull();
      
      // Create user
      const user = db.upsertUserByGoogleSub({
        googleSub: 'test-sub',
        email: 'test@example.com',
        name: 'Test User',
      });
      
      // Claim
      db.claimAnonymousPages(anonToken, user.id);
      
      // Verify
      const claimed = db.getPageById(page.id);
      expect(claimed!.owner_id).toBe(user.id);
      expect(claimed!.user_id).toBe(user.id);
    });

    it('getPagesByUserId returns user pages', async () => {
      const db = await import('@/server/db/sqlite');
      
      const user = db.upsertUserByGoogleSub({
        googleSub: 'test-sub',
        email: 'test@example.com',
        name: 'Test',
      });
      
      db.createPage(user.id, 'Page 1', user.id);
      db.createPage(user.id, 'Page 2', user.id);
      
      const pages = db.getPagesByUserId(user.id);
      
      expect(pages.length).toBe(2);
    });
  });

  describe('Slug Uniqueness', () => {
    it('publishPage reassigns slug from other pages', async () => {
      const db = await import('@/server/db/sqlite');
      
      // Create first page with slug
      const page1 = db.createPage('owner1', 'Page 1');
      db.publishPage({
        id: page1.id,
        content: '{}',
        baseServerRevision: 1,
        slug: 'sameslug',
      });
      
      // Create second page and try to take same slug
      const page2 = db.createPage('owner2', 'Page 2');
      db.publishPage({
        id: page2.id,
        content: '{}',
        baseServerRevision: 1,
        slug: 'sameslug',
      });
      
      // Page2 should have the slug
      const finalPage1 = db.getPageById(page1.id);
      const finalPage2 = db.getPageById(page2.id);
      
      expect(finalPage1!.slug).toBeNull();
      expect(finalPage2!.slug).toBe('sameslug');
    });
  });
});

