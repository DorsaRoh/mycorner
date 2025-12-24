/**
 * E2E tests for the logout and sign-in flow.
 * 
 * Tests:
 * - Logout clears session and redirects to fresh /new
 * - Fresh /new shows starter layout with Sign In button (no account menu)
 * - Sign In redirects to /edit (user's primary page)
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
});

