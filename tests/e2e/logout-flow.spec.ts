/**
 * E2E tests for the logout and sign-in flow.
 * 
 * These tests verify that the "regular window state corruption" issue is fixed:
 * - Logout clears ALL session state (cookies, localStorage, sessionStorage)
 * - Fresh /new shows starter layout with Sign In button (no account menu)
 * - Sign In redirects to /edit (user's primary page)
 * - Cross-account switching works correctly (no stale data leakage)
 * 
 * Key scenarios tested:
 * 1. Logout → fresh starter layout → Sign In visible
 * 2. Cross-account switching: User A → logout → User B → see User B's content
 * 3. Multiple logout/login cycles without incognito
 * 4. No blank pages, no stale content
 */

import { test, expect, loginAsTestUser, clearTestData, selectors } from './fixtures';

test.describe('Logout Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearTestData(page);
  });

  test('logout clears session and redirects to fresh /new with starter layout', async ({ page }) => {
    // First, login as test user and create a page
    const username = `logout${Date.now()}`.slice(0, 20);
    await loginAsTestUser(page, {
      email: `logout-${Date.now()}@example.com`,
      username,
    });

    // Go to /new and wait for editor
    await page.goto('/new');
    await page.waitForURL(/\/edit\/page_/);
    await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 10000 });

    // Verify we see the account menu (logged in state)
    await expect(page.getByTestId('account-menu-trigger')).toBeVisible({ timeout: 5000 });

    // Click account menu to open dropdown
    await page.getByTestId('account-menu-trigger').click();
    
    // Verify email is shown in dropdown
    await expect(page.getByTestId('account-menu-email')).toBeVisible();
    
    // Click logout
    await page.getByTestId('account-menu-logout').click();

    // Wait for redirect to /new?fresh=1 then to /edit/page_xxx
    await page.waitForURL(/\/edit\/page_/, { timeout: 15000 });

    // Verify we're on a fresh editor (starter mode)
    await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 10000 });
    
    // Verify starter mode is active (fresh layout)
    const canvas = page.locator('[data-testid="editor-canvas"]');
    await expect(canvas).toHaveAttribute('data-starter-mode', 'true');

    // Verify Sign In button is visible (not account menu)
    await expect(page.getByTestId('sign-in-button')).toBeVisible();
    
    // Account menu should NOT be visible
    await expect(page.getByTestId('account-menu-trigger')).not.toBeVisible();
  });

  test('sign in button shows auth gate with correct text', async ({ page }) => {
    // Start fresh (logged out)
    await page.goto('/new?fresh=1');
    await page.waitForURL(/\/edit\/page_/);
    await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 10000 });

    // Verify Sign In button is visible
    const signInBtn = page.getByTestId('sign-in-button');
    await expect(signInBtn).toBeVisible();

    // Click Sign In
    await signInBtn.click();

    // Auth gate should appear with sign-in specific text
    await expect(page.getByTestId('auth-gate')).toBeVisible();
    await expect(page.getByText('Sign in to your corner')).toBeVisible();
  });

  test('publish button when logged out shows auth gate with publish text', async ({ page }) => {
    // Start fresh (logged out)
    await page.goto('/new?fresh=1');
    await page.waitForURL(/\/edit\/page_/);
    await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 10000 });

    // Click Publish button
    await page.locator('button:has-text("Publish")').first().click();

    // Auth gate should appear with publish-specific text
    await expect(page.getByTestId('auth-gate')).toBeVisible();
    await expect(page.getByText('Sign in to publish')).toBeVisible();
  });

  test('/new?fresh=1 creates anonymous page ignoring existing session', async ({ page }) => {
    // First, login
    const username = `fresh${Date.now()}`.slice(0, 20);
    await loginAsTestUser(page, {
      email: `fresh-${Date.now()}@example.com`,
      username,
    });

    // Create a page and publish it
    await page.goto('/new');
    await page.waitForURL(/\/edit\/page_/);
    const firstPageUrl = page.url();
    
    await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 10000 });

    // Click publish to own the page
    await page.locator('button:has-text("Publish")').first().click();
    await expect(page.locator('button:has-text("Published!"), button:has-text("Update")')).toBeVisible({ timeout: 15000 });

    // Now go to /new?fresh=1 - should create a NEW anonymous page
    await page.goto('/new?fresh=1');
    await page.waitForURL(/\/edit\/page_/);
    const freshPageUrl = page.url();

    // URL should be different (new page)
    expect(freshPageUrl).not.toEqual(firstPageUrl);

    // Should show Sign In button (fresh mode ignores session)
    await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 10000 });
    // Note: In fresh mode, session is ignored so we're essentially anonymous
    // The page should be in starter mode
    const canvas = page.locator('[data-testid="editor-canvas"]');
    await expect(canvas).toHaveAttribute('data-starter-mode', 'true');
  });

  test('/edit resolves to user primary page after sign-in', async ({ page }) => {
    // Create a user with a published page
    const username = `resolve${Date.now()}`.slice(0, 18);
    await loginAsTestUser(page, {
      email: `resolve-${Date.now()}@example.com`,
      username,
    });

    // Create and publish a page
    await page.goto('/new');
    await page.waitForURL(/\/edit\/page_/);
    const editUrl = page.url();
    const pageId = editUrl.match(/\/edit\/(page_[a-z0-9_]+)/)?.[1];
    
    await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 10000 });

    // Publish
    await page.locator('button:has-text("Publish")').first().click();
    await expect(page.locator('button:has-text("Published!"), button:has-text("Update")')).toBeVisible({ timeout: 15000 });

    // Now logout
    await page.getByTestId('account-menu-trigger').click();
    await page.getByTestId('account-menu-logout').click();
    await page.waitForURL(/\/edit\/page_/, { timeout: 15000 });

    // Login again
    await loginAsTestUser(page, {
      email: `resolve-${Date.now()}@example.com`,
      username,
    });

    // Go to /edit - should resolve to the user's primary page
    await page.goto('/edit');
    await page.waitForURL(/\/edit\//, { timeout: 10000 });

    // Should be on the same page we created
    expect(page.url()).toContain(pageId);
  });

  test('cross-account switching: User A → logout → User B shows correct content', async ({ page }) => {
    // This test verifies the main "regular window state corruption" fix
    // User A creates and publishes a page
    // User A logs out
    // User B logs in and should see their own page, NOT User A's content

    const timestampA = Date.now();
    const usernameA = `usera${timestampA}`.slice(0, 18);
    const emailA = `usera-${timestampA}@example.com`;

    const timestampB = Date.now() + 1;
    const usernameB = `userb${timestampB}`.slice(0, 18);
    const emailB = `userb-${timestampB}@example.com`;

    // === Step 1: Login as User A ===
    await loginAsTestUser(page, { email: emailA, username: usernameA });

    // Create a page for User A
    await page.goto('/new');
    await page.waitForURL(/\/edit\/page_/);
    const userAPageUrl = page.url();
    const userAPageId = userAPageUrl.match(/\/edit\/(page_[a-z0-9_]+)/)?.[1];

    await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 10000 });

    // Verify User A is logged in
    await expect(page.getByTestId('account-menu-trigger')).toBeVisible({ timeout: 5000 });

    // Publish User A's page
    await page.locator('button:has-text("Publish")').first().click();
    await expect(page.locator('button:has-text("Published!"), button:has-text("Update")')).toBeVisible({ timeout: 15000 });

    // Verify the published URL contains User A's username
    const publishedUrlLocator = page.locator(`a[href*="/${usernameA}"]`);
    await expect(publishedUrlLocator).toBeVisible({ timeout: 5000 });

    // === Step 2: Logout as User A ===
    await page.getByTestId('account-menu-trigger').click();
    await page.getByTestId('account-menu-logout').click();

    // Wait for redirect to fresh editor
    await page.waitForURL(/\/edit\/page_/, { timeout: 15000 });
    await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 10000 });

    // Verify we're on a DIFFERENT page (fresh page, not User A's page)
    const freshPageUrl = page.url();
    const freshPageId = freshPageUrl.match(/\/edit\/(page_[a-z0-9_]+)/)?.[1];
    expect(freshPageId).not.toEqual(userAPageId);

    // Verify Sign In button is visible (logged out state)
    await expect(page.getByTestId('sign-in-button')).toBeVisible();
    
    // Verify Account menu is NOT visible
    await expect(page.getByTestId('account-menu-trigger')).not.toBeVisible();

    // Verify starter mode is active
    const canvas = page.locator('[data-testid="editor-canvas"]');
    await expect(canvas).toHaveAttribute('data-starter-mode', 'true');

    // === Step 3: Login as User B ===
    await loginAsTestUser(page, { email: emailB, username: usernameB });

    // Navigate to /edit - User B should see their own page
    await page.goto('/edit');
    await page.waitForURL(/\/edit\//, { timeout: 10000 });

    const userBPageUrl = page.url();
    const userBPageId = userBPageUrl.match(/\/edit\/(page_[a-z0-9_]+)/)?.[1];

    await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 10000 });

    // Verify User B is logged in (account menu visible)
    await expect(page.getByTestId('account-menu-trigger')).toBeVisible({ timeout: 5000 });

    // CRITICAL: User B's page should NOT be User A's page
    expect(userBPageId).not.toEqual(userAPageId);

    // Verify no stale User A data is shown
    // The published URL link should NOT be visible (User B hasn't published yet)
    // OR if visible, should NOT contain User A's username
    const userALink = page.locator(`a[href*="/${usernameA}"]`);
    await expect(userALink).not.toBeVisible();
  });

  test('multiple logout/login cycles maintain correct state', async ({ page }) => {
    // Test that repeated logout/login cycles don't accumulate stale state
    
    const cycles = 3;
    const users: { email: string; username: string; pageId?: string }[] = [];

    for (let i = 0; i < cycles; i++) {
      const timestamp = Date.now() + i;
      const user = {
        email: `cycle${i}-${timestamp}@example.com`,
        username: `cycle${i}${timestamp}`.slice(0, 18),
        pageId: undefined as string | undefined,
      };
      users.push(user);

      // Login as this user
      await loginAsTestUser(page, { email: user.email, username: user.username });

      // Create a page
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      const pageUrl = page.url();
      user.pageId = pageUrl.match(/\/edit\/(page_[a-z0-9_]+)/)?.[1];

      await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 10000 });

      // Verify we're logged in
      await expect(page.getByTestId('account-menu-trigger')).toBeVisible({ timeout: 5000 });

      // Logout
      await page.getByTestId('account-menu-trigger').click();
      await page.getByTestId('account-menu-logout').click();

      // Wait for fresh editor
      await page.waitForURL(/\/edit\/page_/, { timeout: 15000 });
      await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 10000 });

      // Verify we're logged out (Sign In button visible)
      await expect(page.getByTestId('sign-in-button')).toBeVisible();
      
      // Verify starter mode is active (fresh page)
      const canvas = page.locator('[data-testid="editor-canvas"]');
      await expect(canvas).toHaveAttribute('data-starter-mode', 'true');
    }

    // Final verification: all pageIds should be unique
    const pageIds = users.map(u => u.pageId).filter(Boolean);
    const uniqueIds = new Set(pageIds);
    expect(uniqueIds.size).toEqual(cycles);
  });

  test('logout clears localStorage and sessionStorage', async ({ page }) => {
    // Test that logout properly clears client-side storage
    
    const timestamp = Date.now();
    const username = `storage${timestamp}`.slice(0, 18);
    
    // Login
    await loginAsTestUser(page, {
      email: `storage-${timestamp}@example.com`,
      username,
    });

    // Go to editor
    await page.goto('/new');
    await page.waitForURL(/\/edit\/page_/);
    await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 10000 });

    // Set some test values in storage (simulating what the app might do)
    await page.evaluate(() => {
      localStorage.setItem('yourcorner:test', 'should-be-cleared');
      localStorage.setItem('mycorner:legacy', 'should-be-cleared');
      sessionStorage.setItem('publishIntent', 'should-be-cleared');
    });

    // Logout
    await page.getByTestId('account-menu-trigger').click();
    await page.getByTestId('account-menu-logout').click();

    // Wait for redirect
    await page.waitForURL(/\/edit\/page_/, { timeout: 15000 });
    await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 10000 });

    // Check that storage was cleared
    const storageState = await page.evaluate(() => {
      return {
        yourcornerTest: localStorage.getItem('yourcorner:test'),
        mycornerLegacy: localStorage.getItem('mycorner:legacy'),
        publishIntent: sessionStorage.getItem('publishIntent'),
      };
    });

    // All should be null (cleared)
    expect(storageState.yourcornerTest).toBeNull();
    expect(storageState.mycornerLegacy).toBeNull();
    expect(storageState.publishIntent).toBeNull();
  });
});

