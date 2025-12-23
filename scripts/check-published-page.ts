/**
 * Check what's stored in the database for a published page.
 * 
 * Usage: npx ts-node --project tsconfig.server.json scripts/check-published-page.ts <slug>
 */

import * as db from '../src/server/db/sqlite';
import { PageDocSchema } from '../src/lib/schema/page';

const slug = process.argv[2];

if (!slug) {
  console.error('Usage: npx ts-node scripts/check-published-page.ts <slug>');
  process.exit(1);
}

async function main() {
  console.log(`\n=== Checking page with slug: ${slug} ===\n`);
  
  // First try to find by slug
  let page = db.getPageBySlug(slug);
  
  if (!page) {
    // Try as username
    const user = db.getUserByUsername(slug);
    if (user) {
      const pages = db.getPagesByUserId(user.id);
      page = pages.find(p => p.is_published) || null;
    }
  }
  
  if (!page) {
    console.error(`Page not found for slug: ${slug}`);
    process.exit(1);
  }
  
  console.log('=== Page Record ===');
  console.log('ID:', page.id);
  console.log('Slug:', page.slug);
  console.log('Title:', page.title);
  console.log('Is Published:', page.is_published);
  console.log('Published At:', page.published_at);
  console.log('Published Revision:', page.published_revision);
  console.log('Server Revision:', page.server_revision);
  console.log('Has Content:', !!page.content);
  console.log('Content Length:', page.content?.length ?? 0);
  console.log('Has Published Content:', !!page.published_content);
  console.log('Published Content Length:', page.published_content?.length ?? 0);
  console.log('Has Background:', !!page.background);
  console.log('Has Published Background:', !!page.published_background);
  
  console.log('\n=== Published Content Analysis ===');
  
  if (!page.published_content) {
    console.error('ERROR: published_content is null/empty!');
    console.log('\nChecking draft content instead...');
    if (page.content) {
      const content = JSON.parse(page.content);
      console.log('Draft content type:', typeof content);
      console.log('Draft is array:', Array.isArray(content));
      if (Array.isArray(content)) {
        console.log('Draft blocks count:', content.length);
        content.slice(0, 3).forEach((b, i) => {
          console.log(`  Block ${i}: type=${b.type}, x=${b.x}, y=${b.y}, w=${b.width}, h=${b.height}`);
        });
      }
    }
    process.exit(1);
  }
  
  try {
    const content = JSON.parse(page.published_content);
    console.log('Content type:', typeof content);
    console.log('Content keys:', Object.keys(content));
    console.log('Is array:', Array.isArray(content));
    
    // Try to parse as PageDoc
    const parsed = PageDocSchema.safeParse(content);
    if (parsed.success) {
      console.log('\n✅ Valid PageDoc format');
      console.log('Version:', parsed.data.version);
      console.log('Title:', parsed.data.title);
      console.log('Theme:', parsed.data.themeId);
      console.log('Blocks count:', parsed.data.blocks.length);
      console.log('Has background:', !!parsed.data.background);
      
      console.log('\n=== Blocks ===');
      parsed.data.blocks.forEach((b, i) => {
        console.log(`Block ${i}:`);
        console.log(`  Type: ${b.type}`);
        console.log(`  Position: (${b.x}, ${b.y})`);
        console.log(`  Size: ${b.width} x ${b.height}`);
        console.log(`  Content:`, JSON.stringify(b.content).slice(0, 100));
        console.log(`  Style:`, JSON.stringify(b.style || {}).slice(0, 100));
      });
    } else {
      console.log('\n❌ NOT a valid PageDoc');
      console.log('Parse error:', parsed.error.issues[0]);
      
      // Check if it's legacy format (blocks array)
      if (Array.isArray(content)) {
        console.log('\nLooks like legacy format (blocks array)');
        console.log('Blocks count:', content.length);
        content.slice(0, 3).forEach((b, i) => {
          console.log(`  Block ${i}: type=${b.type}, x=${b.x}, y=${b.y}`);
        });
      }
    }
  } catch (e) {
    console.error('Failed to parse published_content:', e);
  }
  
  console.log('\n=== Raw Published Content (first 1000 chars) ===');
  console.log(page.published_content.slice(0, 1000));
}

main().catch(console.error);

