/**
 * E2E tests for public page viewing.
 * 
 * Tests:
 * - Owner vs non-owner UI differences
 * - Share functionality
 * - Clean URLs (no query params)
 */

import { test, expect, loginAsTestUser, logout, clearTestData } from './fixtures';

test.describe('Public Page View', () => {
  test.beforeEach(async ({ page }) => {
    await clearTestData(page);
  });

  test.describe('Visitor View (Non-owner)', () => {
    test('non-owner sees "Make your own" CTA', async ({ page }) => {
      // Create and publish as one user
      const username = `owner${Date.now()}`.slice(0, 20);
      await loginAsTestUser(page, {
        email: `owner-${Date.now()}@example.com`,
        username,
      });
      
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      await page.waitForSelector('.editor, [class*="editor"]', { timeout: 10000 });
      
      // Publish
      await page.locator('button:has-text("Publish")').first().click();
      await expect(page.locator('button:has-text("Published!"), button:has-text("Update")')).toBeVisible({ timeout: 15000 });
      
      // Log out
      await logout(page);
      
      // Visit public page as guest
      await page.goto(`/${username}`);
      
      // Should see "Make your own" link
      await expect(page.locator('a:has-text("Make your own")')).toBeVisible({ timeout: 10000 });
    });

    test('public page has clean URL (no query params)', async ({ page }) => {
      const username = `clean${Date.now()}`.slice(0, 20);
      await loginAsTestUser(page, {
        email: `clean-${Date.now()}@example.com`,
        username,
      });
      
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      await page.waitForSelector('.editor, [class*="editor"]', { timeout: 10000 });
      
      await page.locator('button:has-text("Publish")').first().click();
      await expect(page.locator('button:has-text("Published!"), button:has-text("Update")')).toBeVisible({ timeout: 15000 });
      
      await logout(page);
      
      // Visit public page
      await page.goto(`/${username}`);
      
      // URL should be clean
      const url = new URL(page.url());
      expect(url.pathname).toBe(`/${username}`);
      expect(url.search).toBe(''); // No query params
    });
  });

  test.describe('Owner View', () => {
    test('owner viewing their own page can navigate back to edit', async ({ page }) => {
      const username = `mypage${Date.now()}`.slice(0, 18);
      await loginAsTestUser(page, {
        email: `mypage-${Date.now()}@example.com`,
        username,
      });
      
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      await page.waitForSelector('.editor, [class*="editor"]', { timeout: 10000 });
      
      // Publish
      await page.locator('button:has-text("Publish")').first().click();
      await expect(page.locator('button:has-text("Published!"), button:has-text("Update")')).toBeVisible({ timeout: 15000 });
      
      // Visit public page while still logged in
      await page.goto(`/${username}`);
      
      // Wait for page to load
      await expect(page.locator('.public-page-container, [class*="PublicPageView"]')).toBeVisible({ timeout: 10000 });
      
      // Should be able to navigate back to /edit
      await page.goto('/edit');
      await page.waitForURL(/\/edit\//);
      
      // Editor should load
      await expect(page.locator('.editor, [class*="editor"]')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Content Display', () => {
    test('published page displays content from editor', async ({ page }) => {
      const username = `content${Date.now()}`.slice(0, 18);
      await loginAsTestUser(page, {
        email: `content-${Date.now()}@example.com`,
        username,
      });
      
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      await page.waitForSelector('.editor, [class*="editor"]', { timeout: 10000 });
      
      // Publish
      await page.locator('button:has-text("Publish")').first().click();
      await expect(page.locator('button:has-text("Published!"), button:has-text("Update")')).toBeVisible({ timeout: 15000 });
      
      // Visit public page
      await page.goto(`/${username}`);
      
      // Page container should be visible
      await expect(page.locator('.public-page-container, [class*="PublicPageView"]')).toBeVisible({ timeout: 10000 });
      
      // Canvas should be present
      await expect(page.locator('[class*="canvas"], [class*="Canvas"], [class*="viewer"]')).toBeVisible({ timeout: 5000 });
    });
  });
});

