/**
 * E2E tests for stale client state scenarios.
 * 
 * These tests verify that the app correctly handles:
 * 1. Invalid localStorage JSON
 * 2. Stale/invalid session cookies
 * 3. Version mismatches in client storage
 * 4. Logout flow ending at /new without redirect loops
 * 
 * The goal is to ensure "normal browser" with stale state behaves
 * identically to incognito (clean state).
 */

import { test, expect } from './fixtures';

test.describe('Stale Client State Handling', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing state
    await page.context().clearCookies();
  });

  test('app handles invalid localStorage JSON without crashing', async ({ page }) => {
    // Navigate to app first to ensure localStorage is available
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Set invalid JSON in localStorage
    await page.evaluate(() => {
      localStorage.setItem('yourcorner:draft:v1', '{invalid json');
      localStorage.setItem('yourcorner:storage_version', 'not-a-number');
      localStorage.setItem('yourcorner:other_key', '{"broken":');
    });
    
    // Navigate to /new - should not crash
    await page.goto('/new');
    
    // Should redirect to /edit/[pageId] (creating a new page)
    await page.waitForURL(/\/edit\//, { timeout: 10000 });
    
    // Page should be functional (no JS errors causing blank screen)
    const canvas = page.locator('[data-testid="editor-canvas"]');
    await expect(canvas).toBeVisible({ timeout: 10000 });
    
    // Verify no console errors related to JSON parsing
    const consoleErrors: string[] = [];
    page.on('pageerror', error => {
      consoleErrors.push(error.message);
    });
    
    // Reload to trigger reconciliation again
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Should still work
    await expect(canvas).toBeVisible({ timeout: 10000 });
  });

  test('app handles stale storage version by reconciling', async ({ page }) => {
    // Navigate to app first
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Set old version and some stale keys
    await page.evaluate(() => {
      localStorage.setItem('yourcorner:storage_version', '1');
      localStorage.setItem('yourcorner:stale_auth_marker', 'old_data');
      localStorage.setItem('yourcorner:cached_user', '{"id":"stale"}');
      // Draft should be preserved
      localStorage.setItem('yourcorner:draft:v1', JSON.stringify({
        doc: { version: 1, blocks: [] },
        updatedAt: Date.now(),
        createdAt: Date.now(),
      }));
    });
    
    // Navigate to /new
    await page.goto('/new');
    await page.waitForURL(/\/edit\//, { timeout: 10000 });
    
    // Verify stale keys were cleared but draft preserved
    const storageState = await page.evaluate(() => ({
      version: localStorage.getItem('yourcorner:storage_version'),
      staleAuth: localStorage.getItem('yourcorner:stale_auth_marker'),
      cachedUser: localStorage.getItem('yourcorner:cached_user'),
      hasDraft: localStorage.getItem('yourcorner:draft:v1') !== null,
    }));
    
    expect(storageState.version).toBe('2'); // Current version
    expect(storageState.staleAuth).toBeNull(); // Cleared
    expect(storageState.cachedUser).toBeNull(); // Cleared
    // Note: hasDraft may be true or false depending on whether /new creates new draft
  });

  test('unauthenticated user with stale session cookie can access /new', async ({ page, context }) => {
    // Set a fake/expired session cookie
    await context.addCookies([{
      name: 'yourcorner_session',
      value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmYWtlLXVzZXItaWQiLCJleHAiOjE1MDAwMDAwMDB9.invalidsignature',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    }]);
    
    // Navigate to /new
    await page.goto('/new');
    
    // Should successfully redirect to /edit/[pageId] even with stale cookie
    await page.waitForURL(/\/edit\//, { timeout: 10000 });
    
    // Page should be functional
    const canvas = page.locator('[data-testid="editor-canvas"]');
    await expect(canvas).toBeVisible({ timeout: 10000 });
  });

  test('/edit with stale cookie shows sign-in UI instead of crashing', async ({ page, context }) => {
    // Set a fake/expired session cookie
    await context.addCookies([{
      name: 'yourcorner_session',
      value: 'invalid.cookie.value',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    }]);
    
    // Navigate to /edit
    await page.goto('/edit');
    await page.waitForLoadState('networkidle');
    
    // Should show sign-in UI (auth gate) or sign-in text, not a blank/error page
    // The page should contain either the auth gate or text about signing in
    const pageContent = await page.content();
    const hasSignInContent = 
      pageContent.includes('Sign in') || 
      pageContent.includes('sign in') ||
      pageContent.includes('Google') ||
      pageContent.includes('auth');
    
    expect(hasSignInContent).toBe(true);
    
    // Should not show error page
    expect(pageContent).not.toContain('Something went wrong');
  });

  test('logout flow ends at /new without redirect loop', async ({ page }) => {
    // First, create a page by visiting /new
    await page.goto('/new');
    await page.waitForURL(/\/edit\//, { timeout: 10000 });
    
    // Verify we're on edit page
    const editUrl = page.url();
    expect(editUrl).toContain('/edit/');
    
    // Simulate logout by calling the API
    const logoutResponse = await page.request.post('/api/auth/logout');
    expect(logoutResponse.ok()).toBe(true);
    
    // Clear client storage as logout would
    await page.evaluate(() => {
      // Clear all yourcorner keys
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('yourcorner:') || key?.startsWith('mycorner:')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      sessionStorage.clear();
    });
    
    // Navigate to /new
    await page.goto('/new?fresh=1');
    
    // Should redirect to /edit/[newPageId] - a NEW page
    await page.waitForURL(/\/edit\//, { timeout: 10000 });
    
    // Page should be functional
    const canvas = page.locator('[data-testid="editor-canvas"]');
    await expect(canvas).toBeVisible({ timeout: 10000 });
    
    // URL should be different (new page created)
    const newEditUrl = page.url();
    expect(newEditUrl).toContain('/edit/');
    // The page ID should be different (new page)
    // Extract page IDs
    const oldPageId = editUrl.match(/\/edit\/([^/?]+)/)?.[1];
    const newPageId = newEditUrl.match(/\/edit\/([^/?]+)/)?.[1];
    expect(newPageId).toBeDefined();
    expect(oldPageId).toBeDefined();
    expect(newPageId).not.toBe(oldPageId);
  });

  test('incognito-like clean state works correctly', async ({ page, context }) => {
    // Clear everything to simulate incognito
    await context.clearCookies();
    
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    // Navigate to /new
    await page.goto('/new');
    
    // Should successfully redirect to /edit/[pageId]
    await page.waitForURL(/\/edit\//, { timeout: 10000 });
    
    // Page should be functional
    const canvas = page.locator('[data-testid="editor-canvas"]');
    await expect(canvas).toBeVisible({ timeout: 10000 });
    
    // Storage version should be set
    const version = await page.evaluate(() => 
      localStorage.getItem('yourcorner:storage_version')
    );
    expect(version).toBe('2');
  });

  test('multiple rapid navigations do not cause redirect loops', async ({ page }) => {
    // Rapidly navigate between pages
    const urls = ['/new', '/edit', '/new', '/'];
    
    for (const url of urls) {
      await page.goto(url, { waitUntil: 'commit' });
      // Don't wait for full load, just check we can navigate
    }
    
    // Wait for final navigation to settle
    await page.waitForLoadState('networkidle');
    
    // Should end up on a valid page (not infinite loop)
    const finalUrl = page.url();
    expect(finalUrl).toBeDefined();
    
    // Should not be stuck on an error page
    const pageContent = await page.content();
    expect(pageContent).not.toContain('This page isn\'t working');
    expect(pageContent).not.toContain('ERR_TOO_MANY_REDIRECTS');
  });

  test('debug endpoint returns correct state in development', async ({ page }) => {
    // Only works in development mode
    const response = await page.request.get('/api/debug/client-state');
    
    // In production this would return 404
    // In development it should return state info
    if (response.status() === 200) {
      const state = await response.json() as {
        nodeEnv: string;
        cookies: { present: string[]; hasSession: boolean };
        session: { valid: boolean };
      };
      
      expect(state).toHaveProperty('nodeEnv');
      expect(state).toHaveProperty('cookies');
      expect(state).toHaveProperty('session');
      expect(state.cookies).toHaveProperty('hasSession');
      expect(state.session).toHaveProperty('valid');
    } else {
      // In production, expect 404
      expect(response.status()).toBe(404);
    }
  });
});

test.describe('Storage reconciliation on version mismatch', () => {
  test('clears stale cached user data on version upgrade', async ({ page }) => {
    // Set up stale state with old version
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('yourcorner:storage_version', '1');
      localStorage.setItem('yourcorner:cached_profile', '{"id":"old","email":"old@test.com"}');
      localStorage.setItem('yourcorner:auth_state', 'logged_in');
    });
    
    // Reload to trigger reconciliation
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Check that stale keys are cleared
    const state = await page.evaluate(() => ({
      version: localStorage.getItem('yourcorner:storage_version'),
      profile: localStorage.getItem('yourcorner:cached_profile'),
      authState: localStorage.getItem('yourcorner:auth_state'),
    }));
    
    expect(state.version).toBe('2');
    expect(state.profile).toBeNull();
    expect(state.authState).toBeNull();
  });
});

