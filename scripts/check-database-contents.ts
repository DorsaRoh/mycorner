/**
 * Quick database contents check
 */

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'my-corner.db');

const db = new Database(DB_PATH);

console.log('\n📊 Current Database Contents\n');
console.log(`Database file: ${DB_PATH}\n`);

// Get counts
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
const pageCount = db.prepare('SELECT COUNT(*) as count FROM pages').get() as { count: number };
const feedbackCount = db.prepare('SELECT COUNT(*) as count FROM feedback').get() as { count: number };
const productFeedbackCount = db.prepare('SELECT COUNT(*) as count FROM product_feedback').get() as { count: number };

console.log(`Users: ${userCount.count}`);
console.log(`Pages: ${pageCount.count}`);
console.log(`Feedback: ${feedbackCount.count}`);
console.log(`Product Feedback: ${productFeedbackCount.count}\n`);

if (userCount.count > 0) {
  console.log('Users in database:');
  const users = db.prepare('SELECT email, username, created_at FROM users ORDER BY created_at DESC').all() as any[];
  users.forEach(u => {
    console.log(`  - ${u.email} (username: ${u.username || 'not set'})`);
  });
  console.log('');
}

if (feedbackCount.count > 0) {
  console.log('Feedback in database:');
  const feedback = db.prepare('SELECT page_id, email, message FROM feedback ORDER BY created_at DESC').all() as any[];
  feedback.forEach(f => {
    console.log(`  - Page: ${f.page_id}, Email: ${f.email || 'none'}`);
    console.log(`    Message: "${f.message.substring(0, 50)}..."`);
  });
  console.log('');
}

db.close();

