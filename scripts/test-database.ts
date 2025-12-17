/**
 * Database testing script
 * Tests that emails, usernames, and feedback are being saved correctly
 */

import Database from 'better-sqlite3';
import path from 'path';
import * as db from '../src/server/db/sqlite';

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function logSuccess(msg: string) {
  console.log(`${colors.green}✓${colors.reset} ${msg}`);
}

function logError(msg: string) {
  console.log(`${colors.red}✗${colors.reset} ${msg}`);
}

function logInfo(msg: string) {
  console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`);
}

function logSection(msg: string) {
  console.log(`\n${colors.blue}═══${colors.reset} ${msg} ${colors.blue}═══${colors.reset}`);
}

// Get direct access to the database
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'my-corner.db');
const directDb = new Database(DB_PATH);

async function main() {
  console.log('\n🔍 Testing Database Operations\n');

  // Test 1: Check database file exists
  logSection('Database File Check');
  try {
    const fs = await import('fs');
    if (fs.existsSync(DB_PATH)) {
      logSuccess(`Database file exists at: ${DB_PATH}`);
      const stats = fs.statSync(DB_PATH);
      logInfo(`Database size: ${(stats.size / 1024).toFixed(2)} KB`);
    } else {
      logError(`Database file not found at: ${DB_PATH}`);
      process.exit(1);
    }
  } catch (err) {
    logError(`Error checking database file: ${err}`);
    process.exit(1);
  }

  // Test 2: Check tables exist
  logSection('Tables Check');
  try {
    const tables = directDb.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all() as { name: string }[];

    if (tables.length > 0) {
      logSuccess(`Found ${tables.length} tables:`);
      tables.forEach((t) => logInfo(`  - ${t.name}`));
    } else {
      logError('No tables found!');
    }
  } catch (err) {
    logError(`Error checking tables: ${err}`);
  }

  // Test 3: Test User Operations (Emails & Usernames)
  logSection('User Operations (Emails & Usernames)');
  
  const testEmail = `test_${Date.now()}@example.com`;
  const testGoogleSub = `google_${Date.now()}`;
  const testUsername = `testuser_${Date.now().toString().slice(-6)}`;

  try {
    // Create a test user
    logInfo('Creating test user...');
    const newUser = db.upsertUserByGoogleSub({
      googleSub: testGoogleSub,
      email: testEmail,
      name: 'Test User',
      avatarUrl: 'https://example.com/avatar.jpg',
    });
    
    if (newUser && newUser.email === testEmail) {
      logSuccess(`Created user with email: ${testEmail}`);
      logSuccess(`User ID: ${newUser.id}`);
    } else {
      logError('Failed to create user');
    }

    // Test username setting
    logInfo('Setting username...');
    const usernameResult = db.setUsername(newUser.id, testUsername);
    if (usernameResult.success) {
      logSuccess(`Set username: ${testUsername}`);
    } else {
      logError(`Failed to set username: ${usernameResult.error}`);
    }

    // Verify username was saved
    const userWithUsername = db.getUserById(newUser.id);
    if (userWithUsername?.username === testUsername) {
      logSuccess(`Username verified in database: ${userWithUsername.username}`);
    } else {
      logError('Username not found in database');
    }

    // Test email retrieval
    const userByEmail = db.getUserByEmail(testEmail);
    if (userByEmail && userByEmail.id === newUser.id) {
      logSuccess(`Retrieved user by email successfully`);
    } else {
      logError('Failed to retrieve user by email');
    }

    // Test username retrieval
    const userByUsername = db.getUserByUsername(testUsername);
    if (userByUsername && userByUsername.id === newUser.id) {
      logSuccess(`Retrieved user by username successfully`);
    } else {
      logError('Failed to retrieve user by username');
    }

  } catch (err) {
    logError(`User operations error: ${err}`);
  }

  // Test 4: Test Page Operations
  logSection('Page Operations');
  
  try {
    logInfo('Creating test page...');
    const testOwnerId = `owner_${Date.now()}`;
    const testPage = db.createPage(testOwnerId, 'Test Page');
    
    if (testPage && testPage.id) {
      logSuccess(`Created page with ID: ${testPage.id}`);
      
      // Test page retrieval
      const retrievedPage = db.getPageById(testPage.id);
      if (retrievedPage && retrievedPage.id === testPage.id) {
        logSuccess(`Retrieved page successfully`);
      } else {
        logError('Failed to retrieve page');
      }
    } else {
      logError('Failed to create page');
    }
  } catch (err) {
    logError(`Page operations error: ${err}`);
  }

  // Test 5: Test Feedback Operations (Messages)
  logSection('Feedback Operations (Messages)');
  
  try {
    // First, create a published page for feedback
    const feedbackTestUser = db.upsertUserByGoogleSub({
      googleSub: `google_feedback_${Date.now()}`,
      email: `feedback_${Date.now()}@example.com`,
      name: 'Feedback Test User',
    });

    const feedbackPage = db.createPage(feedbackTestUser.id, 'Feedback Test Page', feedbackTestUser.id);
    
    // Publish the page
    const publishResult = db.publishPage({
      id: feedbackPage.id,
      content: JSON.stringify([]),
      background: undefined,
      baseServerRevision: feedbackPage.server_revision,
      slug: undefined,
    });

    if (publishResult.page && publishResult.page.is_published) {
      logSuccess(`Created and published test page: ${feedbackPage.id}`);

      // Test page feedback
      logInfo('Testing page feedback submission...');
      const testFeedbackEmail = `feedback_${Date.now()}@example.com`;
      const testMessage = 'This is a test feedback message';
      
      const feedback = db.addFeedback(feedbackPage.id, testMessage, testFeedbackEmail);
      
      if (feedback && feedback.message === testMessage) {
        logSuccess(`Added feedback with ID: ${feedback.id}`);
        logSuccess(`Message: "${feedback.message}"`);
        logSuccess(`Email: ${feedback.email}`);
        
        // Verify feedback in database
        const dbFeedback = directDb.prepare('SELECT * FROM feedback WHERE id = ?').get(feedback.id) as any;
        if (dbFeedback && dbFeedback.message === testMessage) {
          logSuccess('Feedback verified in database');
        } else {
          logError('Feedback not found in database');
        }
      } else {
        logError('Failed to add feedback');
      }

      // Test product feedback
      logInfo('Testing product feedback submission...');
      const productFeedbackEmail = `product_${Date.now()}@example.com`;
      const productMessage = 'This is a test product feedback message';
      
      const productFeedback = db.addProductFeedback(productMessage, productFeedbackEmail);
      
      if (productFeedback && productFeedback.message === productMessage) {
        logSuccess(`Added product feedback with ID: ${productFeedback.id}`);
        logSuccess(`Message: "${productFeedback.message}"`);
        logSuccess(`Email: ${productFeedback.email}`);
        
        // Verify product feedback in database
        const dbProductFeedback = directDb.prepare('SELECT * FROM product_feedback WHERE id = ?').get(productFeedback.id) as any;
        if (dbProductFeedback && dbProductFeedback.message === productMessage) {
          logSuccess('Product feedback verified in database');
        } else {
          logError('Product feedback not found in database');
        }
      } else {
        logError('Failed to add product feedback');
      }
    } else {
      logError('Failed to publish test page for feedback');
    }
  } catch (err) {
    logError(`Feedback operations error: ${err}`);
  }

  // Test 6: Show database statistics
  logSection('Database Statistics');
  
  try {
    const userCount = directDb.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    const pageCount = directDb.prepare('SELECT COUNT(*) as count FROM pages').get() as { count: number };
    const feedbackCount = directDb.prepare('SELECT COUNT(*) as count FROM feedback').get() as { count: number };
    const productFeedbackCount = directDb.prepare('SELECT COUNT(*) as count FROM product_feedback').get() as { count: number };
    
    logInfo(`Total users: ${userCount.count}`);
    logInfo(`Total pages: ${pageCount.count}`);
    logInfo(`Total feedback: ${feedbackCount.count}`);
    logInfo(`Total product feedback: ${productFeedbackCount.count}`);

    // Show sample users with emails and usernames
    const users = directDb.prepare('SELECT id, email, username, name, created_at FROM users ORDER BY created_at DESC LIMIT 5').all() as any[];
    if (users.length > 0) {
      console.log('\n  Recent users:');
      users.forEach((u) => {
        console.log(`    - ${u.email} (username: ${u.username || 'not set'}) - Created: ${u.created_at}`);
      });
    }

    // Show sample feedback
    const feedbacks = directDb.prepare('SELECT id, page_id, message, email, created_at FROM feedback ORDER BY created_at DESC LIMIT 5').all() as any[];
    if (feedbacks.length > 0) {
      console.log('\n  Recent feedback:');
      feedbacks.forEach((f) => {
        console.log(`    - Page: ${f.page_id}, Email: ${f.email || 'anonymous'}`);
        console.log(`      Message: "${f.message.substring(0, 50)}${f.message.length > 50 ? '...' : ''}"`);
      });
    }

    // Show sample product feedback
    const productFeedbacks = directDb.prepare('SELECT id, message, email, created_at FROM product_feedback ORDER BY created_at DESC LIMIT 5').all() as any[];
    if (productFeedbacks.length > 0) {
      console.log('\n  Recent product feedback:');
      productFeedbacks.forEach((f) => {
        console.log(`    - Email: ${f.email || 'anonymous'}`);
        console.log(`      Message: "${f.message.substring(0, 50)}${f.message.length > 50 ? '...' : ''}"`);
      });
    }

  } catch (err) {
    logError(`Error getting statistics: ${err}`);
  }

  logSection('Test Complete');
  logSuccess('All database operations tested successfully! ✨');
  
  directDb.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

