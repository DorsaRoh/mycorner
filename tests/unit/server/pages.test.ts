/**
 * Unit tests for src/server/pages.ts
 * 
 * Tests the core page management functions:
 * - createDraftPage
 * - getUserPrimaryPageId
 * - getPageForEdit
 * - claimAnonymousPages
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  createTestUser, 
  createTestPage, 
  generateAnonToken,
  clearTestData,
  resetCounters,
} from '../../utils/testDb';

describe('Server Pages Module', () => {
  beforeEach(async () => {
    resetCounters();
    await clearTestData();
  });

  afterEach(async () => {
    await clearTestData();
  });

  describe('createDraftPage', () => {
    it('creates a new page for authenticated user without existing pages', async () => {
      const db = await import('@/server/db/sqlite');
      const { createDraftPage } = await import('@/server/pages');
      
      // Create user
      const user = db.upsertUserByGoogleSub({
        googleSub: 'test-google-sub',
        email: 'test@example.com',
        name: 'Test User',
      });
      
      const result = await createDraftPage({ userId: user.id });
      
      expect(result.isNew).toBe(true);
      expect(result.pageId).toBeTruthy();
      
      // Verify page exists in DB
      const page = db.getPageById(result.pageId);
      expect(page).toBeTruthy();
      expect(page!.user_id).toBe(user.id);
    });

    it('returns existing page for authenticated user with pages', async () => {
      const db = await import('@/server/db/sqlite');
      const { createDraftPage } = await import('@/server/pages');
      
      // Create user and existing page
      const user = db.upsertUserByGoogleSub({
        googleSub: 'test-google-sub',
        email: 'test@example.com',
        name: 'Test User',
      });
      
      const existingPage = db.createPage(user.id, 'Existing Page', user.id);
      
      const result = await createDraftPage({ userId: user.id });
      
      expect(result.isNew).toBe(false);
      expect(result.pageId).toBe(existingPage.id);
    });

    it('creates a new page for anonymous user with draft token', async () => {
      const { createDraftPage } = await import('@/server/pages');
      const db = await import('@/server/db/sqlite');
      
      const anonToken = generateAnonToken();
      
      const result = await createDraftPage({ anonToken });
      
      expect(result.isNew).toBe(true);
      expect(result.pageId).toBeTruthy();
      
      // Verify page exists and is owned by anon token
      const page = db.getPageById(result.pageId);
      expect(page).toBeTruthy();
      expect(page!.owner_id).toBe(anonToken);
      expect(page!.user_id).toBeNull();
    });

    it('returns existing draft for anonymous user', async () => {
      const { createDraftPage } = await import('@/server/pages');
      const db = await import('@/server/db/sqlite');
      
      const anonToken = generateAnonToken();
      
      // Create first draft
      const firstResult = await createDraftPage({ anonToken });
      
      // Request again with same token
      const secondResult = await createDraftPage({ anonToken });
      
      expect(secondResult.isNew).toBe(false);
      expect(secondResult.pageId).toBe(firstResult.pageId);
    });

    it('throws error when neither userId nor anonToken provided', async () => {
      const { createDraftPage } = await import('@/server/pages');
      
      await expect(createDraftPage({})).rejects.toThrow(
        'Either userId or anonToken is required to create a page'
      );
    });
  });

  describe('getUserPrimaryPageId', () => {
    it('returns null for user with no pages', async () => {
      const db = await import('@/server/db/sqlite');
      const { getUserPrimaryPageId } = await import('@/server/pages');
      
      const user = db.upsertUserByGoogleSub({
        googleSub: 'test-google-sub',
        email: 'test@example.com',
        name: 'Test User',
      });
      
      const pageId = await getUserPrimaryPageId(user.id);
      
      expect(pageId).toBeNull();
    });

    it('returns most recently updated page ID', async () => {
      const db = await import('@/server/db/sqlite');
      const { getUserPrimaryPageId } = await import('@/server/pages');
      
      const user = db.upsertUserByGoogleSub({
        googleSub: 'test-google-sub',
        email: 'test@example.com',
        name: 'Test User',
      });
      
      // Create pages
      const page1 = db.createPage(user.id, 'Page 1', user.id);
      const page2 = db.createPage(user.id, 'Page 2', user.id);
      
      // Update page1 to make it more recent
      db.updatePage(page1.id, { title: 'Updated Page 1' });
      
      const pageId = await getUserPrimaryPageId(user.id);
      
      expect(pageId).toBe(page1.id);
    });
  });

  describe('getPageForEdit', () => {
    it('returns page for authenticated owner', async () => {
      const db = await import('@/server/db/sqlite');
      const { getPageForEdit } = await import('@/server/pages');
      
      const user = db.upsertUserByGoogleSub({
        googleSub: 'test-google-sub',
        email: 'test@example.com',
        name: 'Test User',
      });
      
      const page = db.createPage(user.id, 'Test Page', user.id);
      
      const result = await getPageForEdit({
        pageId: page.id,
        userId: user.id,
      });
      
      expect(result).toBeTruthy();
      expect(result!.page.id).toBe(page.id);
      expect(result!.isOwner).toBe(true);
    });

    it('returns page for anonymous owner with correct token', async () => {
      const db = await import('@/server/db/sqlite');
      const { getPageForEdit } = await import('@/server/pages');
      
      const anonToken = generateAnonToken();
      const page = db.createPage(anonToken, 'Anonymous Draft');
      
      const result = await getPageForEdit({
        pageId: page.id,
        anonToken,
      });
      
      expect(result).toBeTruthy();
      expect(result!.page.id).toBe(page.id);
      expect(result!.isOwner).toBe(true);
    });

    it('returns null for non-owner', async () => {
      const db = await import('@/server/db/sqlite');
      const { getPageForEdit } = await import('@/server/pages');
      
      const owner = db.upsertUserByGoogleSub({
        googleSub: 'owner-sub',
        email: 'owner@example.com',
        name: 'Owner',
      });
      
      const otherUser = db.upsertUserByGoogleSub({
        googleSub: 'other-sub',
        email: 'other@example.com',
        name: 'Other User',
      });
      
      const page = db.createPage(owner.id, 'Owner Page', owner.id);
      
      const result = await getPageForEdit({
        pageId: page.id,
        userId: otherUser.id,
      });
      
      expect(result).toBeNull();
    });

    it('returns null for wrong anonymous token', async () => {
      const db = await import('@/server/db/sqlite');
      const { getPageForEdit } = await import('@/server/pages');
      
      const anonToken = generateAnonToken();
      const wrongToken = generateAnonToken();
      
      const page = db.createPage(anonToken, 'Anonymous Draft');
      
      const result = await getPageForEdit({
        pageId: page.id,
        anonToken: wrongToken,
      });
      
      expect(result).toBeNull();
    });

    it('returns null for non-existent page', async () => {
      const { getPageForEdit } = await import('@/server/pages');
      
      const result = await getPageForEdit({
        pageId: 'non-existent-page-id',
        userId: 'some-user-id',
      });
      
      expect(result).toBeNull();
    });
  });

  describe('claimAnonymousPages', () => {
    it('claims anonymous pages when user authenticates', async () => {
      const db = await import('@/server/db/sqlite');
      const { claimAnonymousPages } = await import('@/server/pages');
      
      const anonToken = generateAnonToken();
      
      // Create anonymous page
      const page = db.createPage(anonToken, 'Anonymous Draft');
      
      // Create user
      const user = db.upsertUserByGoogleSub({
        googleSub: 'test-google-sub',
        email: 'test@example.com',
        name: 'Test User',
      });
      
      // Claim the anonymous pages
      await claimAnonymousPages(anonToken, user.id);
      
      // Verify page is now owned by user
      const claimedPage = db.getPageById(page.id);
      expect(claimedPage!.owner_id).toBe(user.id);
      expect(claimedPage!.user_id).toBe(user.id);
    });

    it('does not claim already claimed pages', async () => {
      const db = await import('@/server/db/sqlite');
      const { claimAnonymousPages } = await import('@/server/pages');
      
      const originalOwner = db.upsertUserByGoogleSub({
        googleSub: 'original-owner-sub',
        email: 'original@example.com',
        name: 'Original Owner',
      });
      
      const attacker = db.upsertUserByGoogleSub({
        googleSub: 'attacker-sub',
        email: 'attacker@example.com',
        name: 'Attacker',
      });
      
      // Create page owned by originalOwner
      const page = db.createPage(originalOwner.id, 'Owned Page', originalOwner.id);
      
      // Attacker tries to claim with owner's ID as token
      await claimAnonymousPages(originalOwner.id, attacker.id);
      
      // Page should still be owned by original owner
      const unchangedPage = db.getPageById(page.id);
      expect(unchangedPage!.user_id).toBe(originalOwner.id);
    });
  });
});

