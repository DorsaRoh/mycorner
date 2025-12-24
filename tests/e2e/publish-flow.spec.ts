/**
 * E2E tests for the publish flow.
 * 
 * Tests:
 * - Publish writes correct data
 * - Public page accessible after publish
 * - Publish success UI feedback
 */

import { test, expect, loginAsTestUser, logout, clearTestData } from './fixtures';

test.describe('Publish Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearTestData(page);
  });

  test.describe('Authenticated Publish', () => {
    test('publish creates public page accessible by slug', async ({ page }) => {
      const username = `pub${Date.now()}`.slice(0, 20);
      
      await loginAsTestUser(page, {
        email: `publish-${Date.now()}@example.com`,
        username,
      });
      
      // Create page via /new
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      
      // Wait for editor
      await page.waitForSelector('.editor, [class*="editor"]', { timeout: 10000 });
      
      // Click publish
      const publishBtn = page.locator('button:has-text("Publish")').first();
      await publishBtn.click();
      
      // Wait for publish to complete
      await expect(page.locator('button:has-text("Published!"), button:has-text("Update")')).toBeVisible({ timeout: 15000 });
      
      // Visit public page
      await page.goto(`/${username}`);
      
      // Should load successfully (not 404)
      await expect(page.locator('.public-page-container, [class*="PublicPageView"]')).toBeVisible({ timeout: 10000 });
    });

    test('publish updates existing published page', async ({ page }) => {
      const username = `upd${Date.now()}`.slice(0, 20);
      
      await loginAsTestUser(page, {
        email: `update-${Date.now()}@example.com`,
        username,
      });
      
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      await page.waitForSelector('.editor, [class*="editor"]', { timeout: 10000 });
      
      // First publish
      const publishBtn = page.locator('button:has-text("Publish")').first();
      await publishBtn.click();
      await expect(page.locator('button:has-text("Published!"), button:has-text("Update")')).toBeVisible({ timeout: 15000 });
      
      // Wait for button to change to "Update"
      await page.waitForTimeout(6000); // Wait for "Published!" to change to "Update"
      
      // Click update
      const updateBtn = page.locator('button:has-text("Update")').first();
      await updateBtn.click();
      
      // Should show success again
      await expect(page.locator('button:has-text("Published!"), button:has-text("Update")')).toBeVisible({ timeout: 15000 });
    });

    test('publish shows success indication', async ({ page }) => {
      const username = `success${Date.now()}`.slice(0, 18);
      
      await loginAsTestUser(page, {
        email: `success-${Date.now()}@example.com`,
        username,
      });
      
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      await page.waitForSelector('.editor, [class*="editor"]', { timeout: 10000 });
      
      // Click publish
      const publishBtn = page.locator('button:has-text("Publish")').first();
      await publishBtn.click();
      
      // Should show "Published!" text
      await expect(page.locator('button:has-text("Published!")')).toBeVisible({ timeout: 15000 });
    });

    test('publish sets correct slug (username)', async ({ page }) => {
      const username = `slug${Date.now()}`.slice(0, 20);
      
      await loginAsTestUser(page, {
        email: `slug-${Date.now()}@example.com`,
        username,
      });
      
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      await page.waitForSelector('.editor, [class*="editor"]', { timeout: 10000 });
      
      // Publish
      await page.locator('button:has-text("Publish")').first().click();
      await expect(page.locator('button:has-text("Published!"), button:has-text("Update")')).toBeVisible({ timeout: 15000 });
      
      // Check that published URL contains the username
      // Look for the URL indicator in the editor
      const publishedUrlIndicator = page.locator(`a[href*="${username}"], text=/${username}`);
      await expect(publishedUrlIndicator).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Guest Publish Flow', () => {
    test('guest publish triggers auth gate', async ({ page }) => {
      // Visit as guest
      await page.goto('/new');
      await page.waitForURL(/\/edit\/page_/);
      await page.waitForSelector('.editor, [class*="editor"]', { timeout: 10000 });
      
      // Click publish
      await page.locator('button:has-text("Publish")').first().click();
      
      // Should show auth gate
      await expect(page.getByText(/sign in|log in|continue with google/i)).toBeVisible({ timeout: 10000 });
    });
  });
});

