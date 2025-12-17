/**
 * Database cleanup script
 * Deletes all data from the database (users, pages, feedback)
 */

import Database from 'better-sqlite3';
import path from 'path';
import readline from 'readline';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'my-corner.db');

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

function logWarning(msg: string) {
  console.log(`${colors.yellow}⚠${colors.reset} ${msg}`);
}

function logInfo(msg: string) {
  console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`);
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

async function main() {
  console.log('\n🗑️  Database Cleanup Script\n');

  const db = new Database(DB_PATH);

  // Get current counts
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  const pageCount = db.prepare('SELECT COUNT(*) as count FROM pages').get() as { count: number };
  const feedbackCount = db.prepare('SELECT COUNT(*) as count FROM feedback').get() as { count: number };
  const productFeedbackCount = db.prepare('SELECT COUNT(*) as count FROM product_feedback').get() as { count: number };

  logWarning('This will DELETE ALL data from the database:');
  logInfo(`  - ${userCount.count} users (emails & usernames)`);
  logInfo(`  - ${pageCount.count} pages`);
  logInfo(`  - ${feedbackCount.count} feedback entries`);
  logInfo(`  - ${productFeedbackCount.count} product feedback entries`);
  console.log('');

  const confirmed = await confirm('Are you sure you want to delete ALL data? (yes/no): ');

  if (!confirmed) {
    console.log('\n❌ Cancelled. No data was deleted.\n');
    db.close();
    process.exit(0);
  }

  console.log('\n🧹 Deleting data...\n');

  try {
    // Delete in correct order to respect foreign key constraints
    
    // 1. Delete feedback (references pages)
    logInfo('Deleting feedback...');
    const feedbackDeleted = db.prepare('DELETE FROM feedback').run();
    logSuccess(`Deleted ${feedbackDeleted.changes} feedback entries`);

    // 2. Delete product feedback (no foreign keys)
    logInfo('Deleting product feedback...');
    const productFeedbackDeleted = db.prepare('DELETE FROM product_feedback').run();
    logSuccess(`Deleted ${productFeedbackDeleted.changes} product feedback entries`);

    // 3. Delete pages (references users)
    logInfo('Deleting pages...');
    const pagesDeleted = db.prepare('DELETE FROM pages').run();
    logSuccess(`Deleted ${pagesDeleted.changes} pages`);

    // 4. Delete users (no dependencies now)
    logInfo('Deleting users...');
    const usersDeleted = db.prepare('DELETE FROM users').run();
    logSuccess(`Deleted ${usersDeleted.changes} users`);

    // Reset app_config if needed (keeps migration state)
    // We DON'T delete this to prevent re-running migrations

    console.log('\n✅ Database cleaned successfully!\n');

    // Show new counts (should all be 0)
    const newUserCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    const newPageCount = db.prepare('SELECT COUNT(*) as count FROM pages').get() as { count: number };
    const newFeedbackCount = db.prepare('SELECT COUNT(*) as count FROM feedback').get() as { count: number };
    const newProductFeedbackCount = db.prepare('SELECT COUNT(*) as count FROM product_feedback').get() as { count: number };

    logInfo(`Current database state:`);
    logInfo(`  - ${newUserCount.count} users`);
    logInfo(`  - ${newPageCount.count} pages`);
    logInfo(`  - ${newFeedbackCount.count} feedback entries`);
    logInfo(`  - ${newProductFeedbackCount.count} product feedback entries`);
    console.log('');

  } catch (err) {
    console.error(`${colors.red}Error:${colors.reset}`, err);
    process.exit(1);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

