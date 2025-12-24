/**
 * E2E tests for draft persistence and claiming.
 * 
 * Tests:
 * - Anonymous draft persistence across refresh
 * - Draft claiming on authentication
 * - Security of claimed pages
 */

import { test, expect, loginAsTestUser, logout, clearTestData } from './fixtures';

test.describe('Draft Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await clearTestData(page);
  });

  test.describe('Anonymous Draft', () => {
    test('anonymous user draft persists across refresh', async ({ page }) => {
      // Visit as anonymous user
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      
      const pageId = page.url().match(/\/edit\/(page_[^/?]+)/)?.[1];
      expect(pageId).toBeTruthy();
      
      // Wait for editor to load
      await page.waitForSelector('.editor, [class*="editor"]', { timeout: 10000 });
      
      // Refresh
      await page.reload();
      
      // Should still be on same page
      expect(page.url()).toContain(pageId);
      
      // Editor should still be visible
      await expect(page.locator('.editor, [class*="editor"]')).toBeVisible();
    });

    test('repeated /new visits return same draft for anonymous user', async ({ page }) => {
      // First visit
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      const firstPageId = page.url().match(/\/edit\/(page_[^/?]+)/)?.[1];
      
      // Navigate away
      await page.goto('about:blank');
      
      // Second visit
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      const secondPageId = page.url().match(/\/edit\/(page_[^/?]+)/)?.[1];
      
      // Should be same page
      expect(secondPageId).toBe(firstPageId);
    });
  });

  test.describe('Draft Claiming', () => {
    test('anonymous draft is claimed after authentication', async ({ page }) => {
      // Create anonymous draft
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      const pageId = page.url().match(/\/edit\/(page_[^/?]+)/)?.[1];
      
      // Wait for content to load
      await page.waitForSelector('.editor, [class*="editor"]', { timeout: 10000 });
      
      // Now authenticate
      const user = await loginAsTestUser(page, {
        email: 'claimer@example.com',
        username: 'claimer',
      });
      
      // Visit /edit to trigger claim and resolution
      await page.goto('/edit');
      
      // Should still have access to the draft (now claimed)
      await page.goto(`/edit/${pageId}`);
      
      // Editor should be visible (means we have access)
      await expect(page.locator('.editor, [class*="editor"]')).toBeVisible({ timeout: 10000 });
    });

    test('after claim, original anonymous token cannot edit', async ({ page, context }) => {
      // Create anonymous draft
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      const pageId = page.url().match(/\/edit\/(page_[^/?]+)/)?.[1];
      
      // Authenticate to claim
      await loginAsTestUser(page, {
        email: 'claimowner@example.com',
        username: 'claimowner',
      });
      
      // Visit to trigger claim
      await page.goto('/edit');
      await page.waitForURL(/\/edit\//);
      
      // Now log out and try to access with new context (different anon token)
      await logout(page);
      
      // Clear cookies to simulate different anonymous session
      await context.clearCookies();
      
      // Try to access the claimed page
      await page.goto(`/edit/${pageId}`);
      
      // Should NOT have access (page is now claimed by user)
      await expect(page.getByText(/not found|permission|access/i)).toBeVisible({ timeout: 10000 });
    });
  });
});

