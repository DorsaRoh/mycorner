/**
 * E2E tests for routing correctness.
 * 
 * Tests the routing model:
 * - / smart redirect
 * - /new draft creation
 * - /edit resolution
 * - /edit/[pageId] loading
 * - /{slug} public pages
 */

import { test, expect, loginAsTestUser, logout, clearTestData, seedTestData } from './fixtures';

test.describe('Routing', () => {
  test.beforeEach(async ({ page }) => {
    // Clear test data before each test
    await clearTestData(page);
  });

  test.describe('/ (Home) Route', () => {
    test('logged out user is redirected to /new then /edit/[pageId]', async ({ page }) => {
      await page.goto('/');
      
      // Should be redirected to /edit/[pageId] (via /new)
      await expect(page).toHaveURL(/\/edit\/page_/);
    });

    test('logged in user is redirected to /edit then /edit/[pageId]', async ({ page }) => {
      // Login first
      await loginAsTestUser(page, { 
        email: 'routing-test@example.com',
        username: 'routetest',
      });
      
      // Visit home
      await page.goto('/');
      
      // Should redirect to /edit/[pageId]
      await expect(page).toHaveURL(/\/edit\//);
    });
  });

  test.describe('/new Route', () => {
    test('creates draft and redirects to /edit/[pageId]', async ({ page }) => {
      await page.goto('/new');
      
      // Should redirect to edit page with page ID
      await expect(page).toHaveURL(/\/edit\/page_/);
    });

    test('repeated visits create new pages (fresh start each time)', async ({ page }) => {
      // NOTE: /new now ALWAYS creates a fresh page - this is intentional
      // to prevent the infinite redirect loop bug caused by stale tokens.
      // If you want to resume editing, go directly to /edit/[pageId].
      
      await page.goto('/new');
      const firstUrl = page.url();
      
      // Extract page ID from URL
      const pageId1 = firstUrl.match(/\/edit\/(page_[^/?]+)/)?.[1];
      expect(pageId1).toBeTruthy();
      
      // Wait for editor to load
      await expect(page.locator('.editor, [class*="Editor"]')).toBeVisible({ timeout: 10000 });
      
      // Visit /new again
      await page.goto('/new');
      const secondUrl = page.url();
      const pageId2 = secondUrl.match(/\/edit\/(page_[^/?]+)/)?.[1];
      expect(pageId2).toBeTruthy();
      
      // Should be a DIFFERENT page (each /new creates fresh)
      expect(pageId2).not.toBe(pageId1);
    });
  });

  test.describe('/edit Route', () => {
    test('logged in user with page goes to /edit/[pageId]', async ({ page }) => {
      // Login and create a page
      const user = await loginAsTestUser(page, {
        email: 'edit-route@example.com',
        username: 'editroute',
      });
      
      // Create a page via /new
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      const pageUrl = page.url();
      
      // Now visit /edit
      await page.goto('/edit');
      
      // Should redirect to the same page
      await expect(page).toHaveURL(pageUrl);
    });

    test('logged out user sees auth gate or redirects to /new', async ({ page }) => {
      await page.goto('/edit');
      
      // Either shows auth gate or redirects to /new -> /edit/[pageId]
      const url = page.url();
      const hasAuthGate = await page.locator('text=Sign in').count() > 0;
      const isOnEditPage = url.includes('/edit/page_');
      
      // One of these should be true
      expect(hasAuthGate || isOnEditPage).toBe(true);
    });
  });

  test.describe('/edit/[pageId] Route', () => {
    test('loads correct draft for owner', async ({ page }) => {
      await loginAsTestUser(page, {
        email: 'pageowner@example.com',
        username: 'pageowner',
      });
      
      // Create a page
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      
      const pageId = page.url().match(/\/edit\/(page_[^/?]+)/)?.[1];
      expect(pageId).toBeTruthy();
      
      // Should show editor with content
      await expect(page.locator('.editor, [class*="editor"]')).toBeVisible({ timeout: 10000 });
    });

    test('refresh does not reset content', async ({ page }) => {
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      
      // Wait for editor to load
      await page.waitForSelector('.editor, [class*="editor"]', { timeout: 10000 });
      
      // Get current URL
      const url = page.url();
      
      // Refresh
      await page.reload();
      
      // Should still be on same page
      await expect(page).toHaveURL(url);
      
      // Editor should still be visible
      await expect(page.locator('.editor, [class*="editor"]')).toBeVisible({ timeout: 10000 });
    });

    test('handles non-existent page gracefully', async ({ page }) => {
      await page.goto('/edit/nonexistent_page_id_123');
      
      // The page should handle this by:
      // 1. Showing an error message, OR
      // 2. Redirecting to /new (once, not in a loop)
      // 
      // Wait for the page to settle
      await page.waitForTimeout(2000);
      
      const url = page.url();
      const hasError = await page.getByText(/not found|doesn't exist|no access|something went wrong|redirect loop/i).count() > 0;
      const wasRedirectedToNew = url.includes('/new') || url.includes('/edit/page_');
      const isShowingLoading = await page.getByText(/loading/i).count() > 0;
      
      // One of these should be true (not stuck in loading forever)
      // After 2 seconds, we should have either an error, a redirect, or still loading (but not looping)
      expect(hasError || wasRedirectedToNew || isShowingLoading).toBe(true);
      
      // If still loading, wait more and check URL is stable (no loop)
      if (isShowingLoading && !hasError && !wasRedirectedToNew) {
        const url1 = page.url();
        await page.waitForTimeout(2000);
        const url2 = page.url();
        // URLs should be the same (not bouncing between different page IDs)
        expect(url2.replace(/\?.*$/, '')).toBe(url1.replace(/\?.*$/, ''));
      }
    });

    test('denies access for wrong owner', async ({ page }) => {
      // Create a page as user 1
      await loginAsTestUser(page, {
        email: 'owner1@example.com',
        username: 'owner1test',
      });
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      const pageUrl = page.url();
      const pageId = pageUrl.match(/\/edit\/(page_[^/?]+)/)?.[1];
      
      // Log out and log in as different user
      await logout(page);
      await loginAsTestUser(page, {
        email: 'owner2@example.com',
        username: 'owner2test',
      });
      
      // Try to access first user's page
      await page.goto(`/edit/${pageId}`);
      
      // Should either:
      // 1. Show access denied/not found message, OR
      // 2. Redirect to /new (once, not in a loop)
      await page.waitForTimeout(2000);
      
      const url = page.url();
      const hasError = await page.getByText(/not found|permission|access|something went wrong/i).count() > 0;
      const wasRedirected = !url.includes(pageId!);
      
      // Should have denied access somehow
      expect(hasError || wasRedirected).toBe(true);
    });
  });

  test.describe('/{slug} Public Page Route', () => {
    test('returns 404 for unpublished or missing page', async ({ page }) => {
      await page.goto('/nonexistent-slug');
      
      // Should show 404 page
      await expect(page.getByText(/not found|doesn't exist|404/i)).toBeVisible({ timeout: 10000 });
    });

    test('loads published content when exists', async ({ page }) => {
      // Create and publish a page
      const user = await loginAsTestUser(page, {
        email: 'publisher@example.com',
        username: 'pubtest',
      });
      
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      
      // Wait for editor and click publish
      await page.waitForSelector('.editor, [class*="editor"]', { timeout: 10000 });
      
      // Find and click publish button
      const publishBtn = page.locator('button:has-text("Publish")').first();
      await publishBtn.click();
      
      // Wait for publish to complete (button changes text)
      await expect(page.locator('button:has-text("Published!"), button:has-text("Update")')).toBeVisible({ timeout: 15000 });
      
      // Visit the public page
      await page.goto(`/${user.username}`);
      
      // Should show the page content (not 404)
      await expect(page.locator('.public-page-container, [class*="PublicPageView"]')).toBeVisible({ timeout: 10000 });
    });
  });
});

