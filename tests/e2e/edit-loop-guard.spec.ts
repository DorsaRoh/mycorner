/**
 * E2E tests for edit redirect loop prevention.
 * 
 * These tests ensure that the infinite redirect loop bug (where /edit keeps
 * redirecting to /new and back) cannot happen, even with stale browser state.
 * 
 * BUG CONTEXT:
 * In normal browsers (not incognito), navigating to /edit/<pageId> could cause
 * an infinite loop where the URL keeps changing to new page IDs:
 *   /edit/page_1766602844933_vax7c7
 *   → /edit/page_1766602843452_hlk2a0
 *   → /edit/page_1766602841548_37c1jc
 *   … forever
 * 
 * ROOT CAUSE:
 * When /new creates a page and redirects to /edit/page_xxx?dt=NEW_TOKEN,
 * the browser might still send the OLD draft_owner cookie (redirect happens
 * before Set-Cookie is processed). The old code ignored the query param
 * if ANY cookie existed, causing ownership mismatch → redirect to /new → loop.
 * 
 * FIX:
 * Always prefer the dt query param over cookies, and add a redirect guard
 * that detects and breaks loops.
 */

import { test, expect, clearTestData } from './fixtures';

test.describe('Edit Redirect Loop Prevention', () => {
  test.beforeEach(async ({ page }) => {
    // Clear test data before each test
    await clearTestData(page);
    
    // Clear all storage to start fresh
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('normal flow: /new creates page and redirects to /edit correctly', async ({ page }) => {
    // Navigate to /new
    await page.goto('/new');
    
    // Should redirect to /edit/page_xxx
    await expect(page).toHaveURL(/\/edit\/page_/, { timeout: 10000 });
    
    // Extract the page ID
    const url = page.url();
    const pageId = url.match(/\/edit\/(page_[^/?]+)/)?.[1];
    expect(pageId).toBeTruthy();
    
    // Wait for editor to load (proves we're not in a loop)
    await expect(page.locator('.editor, [class*="Editor"]')).toBeVisible({ timeout: 10000 });
    
    // URL should be stable (no query params after cleanup)
    const finalUrl = page.url();
    expect(finalUrl).not.toContain('dt=');
    expect(finalUrl).toContain(pageId!);
  });

  test('URL stability: page does not keep changing', async ({ page }) => {
    // Navigate to /new
    await page.goto('/new');
    await expect(page).toHaveURL(/\/edit\/page_/, { timeout: 10000 });
    
    // Record the initial URL
    const initialUrl = page.url();
    const initialPageId = initialUrl.match(/\/edit\/(page_[^/?]+)/)?.[1];
    
    // Wait a bit to ensure no further redirects
    await page.waitForTimeout(2000);
    
    // URL should still be the same (or cleaned up version without dt=)
    const finalUrl = page.url();
    const finalPageId = finalUrl.match(/\/edit\/(page_[^/?]+)/)?.[1];
    
    expect(finalPageId).toBe(initialPageId);
  });

  test('stale cookie simulation: dt query param takes precedence', async ({ page, context }) => {
    // First, create a page normally
    await page.goto('/new');
    await expect(page).toHaveURL(/\/edit\/page_/, { timeout: 10000 });
    
    // Get the current cookies
    const cookies = await context.cookies();
    const draftCookie = cookies.find(c => c.name === 'yourcorner_draft_owner');
    expect(draftCookie).toBeTruthy();
    
    // Now simulate the bug scenario:
    // 1. We have an OLD cookie
    // 2. We navigate to a NEW page with dt= query param
    // The dt query param should win, not the cookie
    
    // Create another page (this will generate a new token)
    await page.goto('/new');
    await expect(page).toHaveURL(/\/edit\/page_/, { timeout: 10000 });
    
    const newUrl = page.url();
    const newPageId = newUrl.match(/\/edit\/(page_[^/?]+)/)?.[1];
    
    // Page should load successfully (editor visible)
    await expect(page.locator('.editor, [class*="Editor"]')).toBeVisible({ timeout: 10000 });
    
    // URL should be stable
    await page.waitForTimeout(1000);
    const finalUrl = page.url();
    expect(finalUrl).toContain(newPageId!);
  });

  test('redirect loop guard: detects and stops infinite redirects', async ({ page }) => {
    // Simulate multiple rapid redirects by setting the guard in sessionStorage
    await page.goto('/new');
    await expect(page).toHaveURL(/\/edit\/page_/, { timeout: 10000 });
    
    // Manually trigger the redirect guard multiple times
    await page.evaluate(() => {
      const guard = {
        count: 5, // Simulate 5 redirects already
        firstAt: Date.now() - 5000, // Started 5 seconds ago
        lastAt: Date.now(),
      };
      sessionStorage.setItem('yourcorner:edit_redirect_guard', JSON.stringify(guard));
    });
    
    // Navigate to a non-existent page (would normally trigger redirect)
    await page.goto('/edit/page_nonexistent_12345');
    
    // Should show error UI instead of redirecting (guard should block)
    // Give it a moment to render the error
    await page.waitForTimeout(1000);
    
    // Either shows error message OR the redirect was blocked
    // Check that URL is stable (not continuously changing)
    const url1 = page.url();
    await page.waitForTimeout(2000);
    const url2 = page.url();
    
    // URL should be stable (same page, not bouncing)
    expect(url2.replace(/\?.*$/, '')).toBe(url1.replace(/\?.*$/, ''));
  });

  test('corrupted localStorage does not cause loop', async ({ page }) => {
    // Set corrupted localStorage before navigating
    await page.addInitScript(() => {
      localStorage.setItem('yourcorner:draft:v1', 'not valid json {{{');
      localStorage.setItem('mycorner:activeDraft', 'also_broken');
    });
    
    // Navigate to /new
    await page.goto('/new');
    
    // Should still work and redirect to /edit
    await expect(page).toHaveURL(/\/edit\/page_/, { timeout: 10000 });
    
    // Editor should load
    await expect(page.locator('.editor, [class*="Editor"]')).toBeVisible({ timeout: 10000 });
  });

  test('no localStorage causes no issues', async ({ page }) => {
    // Clear localStorage in an init script
    await page.addInitScript(() => {
      try {
        localStorage.clear();
      } catch {}
    });
    
    // Navigate to /new
    await page.goto('/new');
    
    // Should redirect to /edit/page_xxx
    await expect(page).toHaveURL(/\/edit\/page_/, { timeout: 10000 });
    
    // Editor should load
    await expect(page.locator('.editor, [class*="Editor"]')).toBeVisible({ timeout: 10000 });
  });

  test('multiple /new visits in succession do not cause issues', async ({ page }) => {
    const pageIds: string[] = [];
    
    // Visit /new multiple times
    for (let i = 0; i < 3; i++) {
      await page.goto('/new');
      await expect(page).toHaveURL(/\/edit\/page_/, { timeout: 10000 });
      
      const url = page.url();
      const pageId = url.match(/\/edit\/(page_[^/?]+)/)?.[1];
      if (pageId) {
        pageIds.push(pageId);
      }
      
      // Wait for editor
      await expect(page.locator('.editor, [class*="Editor"]')).toBeVisible({ timeout: 10000 });
    }
    
    // Each visit should create a different page (that's expected behavior for /new)
    // But importantly, no visit should have caused a loop
    expect(pageIds.length).toBe(3);
    
    // All page IDs should be valid format
    for (const id of pageIds) {
      expect(id).toMatch(/^page_\d+_[a-z0-9]+$/);
    }
  });

  test('going back in history after /new does not cause loop', async ({ page }) => {
    // Navigate to home first
    await page.goto('/');
    await expect(page).toHaveURL(/\/edit\/page_/, { timeout: 10000 });
    
    const firstUrl = page.url();
    
    // Navigate to /new (creates new page)
    await page.goto('/new');
    await expect(page).toHaveURL(/\/edit\/page_/, { timeout: 10000 });
    
    const secondUrl = page.url();
    
    // Wait for editor
    await expect(page.locator('.editor, [class*="Editor"]')).toBeVisible({ timeout: 10000 });
    
    // Go back
    await page.goBack();
    
    // Should handle gracefully (either shows first page or stays on second)
    // The key is no infinite loop
    await page.waitForTimeout(2000);
    
    const finalUrl = page.url();
    // URL should be stable (either first or second page, or /new)
    expect(
      finalUrl.includes('/edit/page_') || 
      finalUrl === '/new'
    ).toBe(true);
  });
});

test.describe('Debug Endpoint', () => {
  test('GET /api/debug/edit-loop returns diagnostics', async ({ request }) => {
    const response = await request.get('/api/debug/edit-loop?pageId=page_test_123');
    
    // In test/dev environment, should return 200
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    
    // Should have expected structure
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('auth');
    expect(data).toHaveProperty('cookies');
    expect(data).toHaveProperty('recommendation');
    
    // Auth info should be present
    expect(data.auth).toHaveProperty('isAuthenticated');
    expect(data.auth).toHaveProperty('hasDraftOwnerCookie');
    
    // Page info should be present (we passed a pageId)
    expect(data).toHaveProperty('page');
    expect(data.page.requestedPageId).toBe('page_test_123');
  });
});

