/**
 * Playwright test fixtures for E2E tests.
 * 
 * Provides helpers for authentication, seeding, and common operations.
 */

import { test as base, expect } from '@playwright/test';

// =============================================================================
// Types
// =============================================================================

interface TestUser {
  id: string;
  email: string;
  username: string | null;
}

interface TestFixtures {
  testUser: TestUser;
  authenticatedPage: void;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Log in as a test user via the test-only API route.
 */
async function loginAsTestUser(
  page: { goto: (url: string) => Promise<void>; request: { post: (url: string, options: { data: unknown }) => Promise<{ ok: () => boolean; json: () => Promise<unknown> }> } },
  options: { email?: string; username?: string } = {}
): Promise<TestUser> {
  const response = await page.request.post('/api/test/login', {
    data: {
      email: options.email || `e2e-user-${Date.now()}@test.com`,
      username: options.username,
    },
  });
  
  if (!response.ok()) {
    throw new Error(`Failed to login: ${await response.json()}`);
  }
  
  const data = await response.json() as { user: TestUser };
  return data.user;
}

/**
 * Log out the current user.
 */
async function logout(page: { request: { post: (url: string) => Promise<{ ok: () => boolean }> } }): Promise<void> {
  await page.request.post('/api/test/logout');
}

/**
 * Clear all test data.
 */
async function clearTestData(page: { request: { post: (url: string) => Promise<{ ok: () => boolean }> } }): Promise<void> {
  await page.request.post('/api/test/clear');
}

/**
 * Seed test data.
 */
async function seedTestData(
  page: { request: { post: (url: string, options: { data: unknown }) => Promise<{ ok: () => boolean; json: () => Promise<unknown> }> } },
  data: { clear?: boolean; users?: unknown[]; pages?: unknown[] }
): Promise<unknown> {
  const response = await page.request.post('/api/test/seed', { data });
  return response.json();
}

// =============================================================================
// Extended Test Fixtures
// =============================================================================

export const test = base.extend<TestFixtures>({
  /**
   * Create and login a test user for the test.
   */
  testUser: async ({ page }, use) => {
    const user = await loginAsTestUser(page, {
      email: `e2e-${Date.now()}@test.com`,
      username: `e2euser${Date.now()}`.slice(0, 20),
    });
    
    await use(user);
    
    // Cleanup after test
    await logout(page);
  },
  
  /**
   * Ensure user is authenticated before test runs.
   */
  authenticatedPage: async ({ page }, use) => {
    await loginAsTestUser(page, {
      email: `auth-${Date.now()}@test.com`,
      username: `authuser${Date.now()}`.slice(0, 20),
    });
    
    await use();
    
    await logout(page);
  },
});

export { expect };

// =============================================================================
// Exported Helpers
// =============================================================================

export { loginAsTestUser, logout, clearTestData, seedTestData };

// =============================================================================
// Test Selectors - Common data-testid values
// =============================================================================

export const selectors = {
  // Editor
  canvas: '[data-testid="editor-canvas"]',
  publishButton: 'button:has-text("Publish"), button:has-text("Update"), button:has-text("Published!")',
  publishToast: '[data-testid="publish-toast"]',
  authGate: '[data-testid="auth-gate"]',
  
  // Blocks
  textBlock: '[data-testid="block-text"]',
  imageBlock: '[data-testid="block-image"]',
  linkBlock: '[data-testid="block-link"]',
  
  // Public page
  publicPageContainer: '.public-page-container',
  makeYourOwnButton: 'a:has-text("Make your own")',
  editButton: 'a:has-text("Edit")',
  shareButton: 'button:has-text("Share")',
  
  // Creation palette
  creationPalette: '[data-testid="creation-palette"]',
  addTextButton: '[data-testid="add-text-block"]',
  addImageButton: '[data-testid="add-image-block"]',
  addLinkButton: '[data-testid="add-link-block"]',
};

