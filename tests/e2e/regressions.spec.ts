/**
 * E2E regression tests for historically painful bugs.
 * 
 * These tests prevent previously-fixed bugs from recurring.
 */

import { test, expect, loginAsTestUser, logout, clearTestData } from './fixtures';

test.describe('Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    await clearTestData(page);
  });

  test.describe('Blank /edit page regression', () => {
    test('/edit never shows blank page for logged in user', async ({ page }) => {
      await loginAsTestUser(page, {
        email: `blank-test-${Date.now()}@example.com`,
        username: `blanktest${Date.now()}`.slice(0, 18),
      });
      
      // Visit /edit multiple times
      for (let i = 0; i < 3; i++) {
        await page.goto('/edit');
        
        // Should either redirect to /edit/[pageId] or show content
        await page.waitForURL(/\/edit/);
        
        // Wait a moment for any redirects
        await page.waitForTimeout(500);
        
        // Should have editor visible, not blank
        await expect(page.locator('.editor, [class*="editor"], text=Sign in')).toBeVisible({ timeout: 10000 });
      }
    });

    test('/edit never shows blank page for anonymous user', async ({ page }) => {
      await page.goto('/edit');
      
      // Should show either auth gate or redirect to /new -> /edit/[pageId]
      await page.waitForTimeout(2000);
      
      const hasContent = await page.locator('.editor, [class*="editor"], text=Sign in, text=Continue').count();
      expect(hasContent).toBeGreaterThan(0);
    });
  });

  test.describe('Refresh resets /new draft regression', () => {
    test('/new does not create new draft on refresh', async ({ page }) => {
      // First visit
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      const firstUrl = page.url();
      const firstPageId = firstUrl.match(/\/edit\/(page_[^/?]+)/)?.[1];
      
      // Navigate to /new again
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      const secondPageId = page.url().match(/\/edit\/(page_[^/?]+)/)?.[1];
      
      // Should return to same page, not create new
      expect(secondPageId).toBe(firstPageId);
    });

    test('refresh on /edit/[pageId] preserves content', async ({ page }) => {
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      const pageUrl = page.url();
      
      // Wait for content
      await page.waitForSelector('.editor, [class*="editor"]', { timeout: 10000 });
      
      // Refresh
      await page.reload();
      
      // Should be on same URL
      expect(page.url()).toBe(pageUrl);
      
      // Content should still be visible
      await expect(page.locator('.editor, [class*="editor"]')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Publish requires auth regression', () => {
    test('guest clicking publish sees auth modal, not error', async ({ page }) => {
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      await page.waitForSelector('.editor, [class*="editor"]', { timeout: 10000 });
      
      // Click publish
      await page.locator('button:has-text("Publish")').first().click();
      
      // Should show auth modal, not error
      await expect(page.getByText(/sign in|log in|continue with google/i)).toBeVisible({ timeout: 10000 });
      
      // Should NOT show error message
      const errorVisible = await page.locator('text=error, text=failed, text=something went wrong').count();
      expect(errorVisible).toBe(0);
    });
  });

  test.describe('Published URL clean regression', () => {
    test('public page URL has no query parameters', async ({ page }) => {
      const username = `cleanurl${Date.now()}`.slice(0, 17);
      await loginAsTestUser(page, {
        email: `cleanurl-${Date.now()}@example.com`,
        username,
      });
      
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      await page.waitForSelector('.editor, [class*="editor"]', { timeout: 10000 });
      
      // Publish
      await page.locator('button:has-text("Publish")').first().click();
      await expect(page.locator('button:has-text("Published!"), button:has-text("Update")')).toBeVisible({ timeout: 15000 });
      
      await logout(page);
      
      // Visit public page
      await page.goto(`/${username}`);
      
      // URL should have no query params like _t or _cb
      const url = page.url();
      expect(url).not.toContain('_t=');
      expect(url).not.toContain('_cb=');
      expect(url).not.toContain('?');
    });
  });

  test.describe('Session stability', () => {
    test('authenticated session persists across page navigations', async ({ page }) => {
      const username = `session${Date.now()}`.slice(0, 18);
      await loginAsTestUser(page, {
        email: `session-${Date.now()}@example.com`,
        username,
      });
      
      // Navigate between pages
      await page.goto('/edit');
      await page.waitForURL(/\/edit/);
      
      await page.goto('/new');
      await page.waitForURL(/\/edit\//);
      
      await page.goto('/edit');
      await page.waitForURL(/\/edit\//);
      
      // Check auth status
      const response = await page.request.get('/api/me');
      const data = await response.json() as { user: { id: string } | null };
      
      // Should still be authenticated
      expect(data.user).toBeTruthy();
      expect(data.user?.id).toBeTruthy();
    });

    test('page content survives multiple navigations', async ({ page }) => {
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      const pageId = page.url().match(/\/edit\/(page_[^/?]+)/)?.[1];
      
      // Navigate away and back multiple times
      await page.goto('/');
      await page.waitForURL(/\/edit\//);
      
      await page.goto(`/edit/${pageId}`);
      
      // Editor should still show content
      await expect(page.locator('.editor, [class*="editor"]')).toBeVisible({ timeout: 10000 });
    });
  });
});

