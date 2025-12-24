/**
 * Vitest global setup file.
 * 
 * This file runs before all tests and sets up the test environment.
 * IMPORTANT: Environment variables MUST be set before any imports.
 */

import path from 'path';
import fs from 'fs';

// Set test environment BEFORE any imports
const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test-corner.db');
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret-for-testing-only';
process.env.DATABASE_PATH = TEST_DB_PATH;

// Now import test utilities
import { beforeAll, afterAll, afterEach, vi } from 'vitest';

/**
 * Clean up test database before tests run.
 */
beforeAll(() => {
  // Remove existing test database files for clean slate
  const dbFiles = [
    TEST_DB_PATH,
    `${TEST_DB_PATH}-shm`,
    `${TEST_DB_PATH}-wal`,
  ];
  
  for (const file of dbFiles) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch (e) {
      // Ignore errors - file may be locked
    }
  }
  
  // Ensure data directory exists
  const dataDir = path.dirname(TEST_DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
});

/**
 * Clean up after all tests complete.
 */
afterAll(() => {
  // Reset module cache to ensure clean database on next run
  vi.resetModules();
});

/**
 * Reset any mocks after each test.
 */
afterEach(() => {
  vi.clearAllMocks();
});

