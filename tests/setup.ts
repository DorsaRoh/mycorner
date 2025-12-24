/**
 * Vitest global setup file.
 * 
 * This file runs before all tests and sets up the test environment.
 */

import { beforeAll, afterAll, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret-for-testing-only';

// Use a separate test database
const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test-corner.db');
process.env.DATABASE_PATH = TEST_DB_PATH;

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
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
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
  // Optional: Remove test database after tests
  // Keeping it for debugging purposes; CI will clean up anyway
});

/**
 * Reset any mocks after each test.
 */
afterEach(() => {
  // Reset any module-level state if needed
});

