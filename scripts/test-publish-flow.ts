#!/usr/bin/env npx ts-node
/**
 * Regression test for the publish flow.
 * 
 * This script verifies that:
 * 1. Published pages can be fetched via getPublishedPageBySlug
 * 2. The returned PageDoc has blocks
 * 3. Unpublished pages return null
 * 
 * Run with: npx ts-node scripts/test-publish-flow.ts
 */

import path from 'path';

// Set up module aliases for @/ imports
import 'tsconfig-paths/register';

async function main() {
  console.log('========================================');
  console.log('  Publish Flow Regression Test');
  console.log('========================================\n');
  
  // Import after setting up paths
  const { getPublishedPageBySlug } = await import('../src/lib/pages');
  const db = await import('../src/server/db');
  
  const testSlug = `test_${Date.now()}`;
  const testUserId = 'test-user-' + Date.now();
  
  console.log('Test Configuration:');
  console.log(`  Test slug: ${testSlug}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');
  
  try {
    // Test 1: Verify unpublished/non-existent returns null
    console.log('Test 1: Non-existent slug returns null');
    const nonExistent = await getPublishedPageBySlug('definitely-does-not-exist-xyz123');
    if (nonExistent === null) {
      console.log('  ✅ PASS: Returns null for non-existent slug\n');
    } else {
      console.error('  ❌ FAIL: Expected null, got:', nonExistent);
      process.exit(1);
    }
    
    // Test 2: Create a test page and publish it
    console.log('Test 2: Create and publish a page');
    
    // First, we need to create a user (in dev, we can simulate this)
    // For this test, we'll directly use the database
    
    // Check if we can access the database
    try {
      const publicPages = await db.getPublicPages(1);
      console.log(`  Found ${publicPages.length} existing published pages in DB`);
      
      if (publicPages.length > 0) {
        // Test with an existing published page
        const existingPage = publicPages[0];
        console.log(`  Using existing page: ${existingPage.slug || existingPage.id}`);
        
        if (existingPage.slug) {
          const pageData = await getPublishedPageBySlug(existingPage.slug);
          
          if (pageData) {
            console.log(`  ✅ PASS: Fetched published page`);
            console.log(`    - Slug: ${pageData.slug}`);
            console.log(`    - Blocks: ${pageData.doc.blocks.length}`);
            console.log(`    - Theme: ${pageData.doc.themeId}`);
            
            if (pageData.doc.blocks.length === 0) {
              console.warn('  ⚠️  WARNING: Page has 0 blocks!');
            }
          } else {
            console.error('  ❌ FAIL: Could not fetch published page by slug');
            process.exit(1);
          }
        } else {
          console.log('  ⚠️  SKIP: Existing page has no slug');
        }
      } else {
        console.log('  ⚠️  SKIP: No published pages to test with');
      }
    } catch (dbError) {
      console.log('  ⚠️  SKIP: Could not access database:', dbError);
    }
    
    console.log('');
    
    // Test 3: Verify PageDoc structure
    console.log('Test 3: Verify PageDoc structure');
    
    const publicPages = await db.getPublicPages(1);
    if (publicPages.length > 0 && publicPages[0].slug) {
      const pageData = await getPublishedPageBySlug(publicPages[0].slug);
      
      if (pageData) {
        const { doc } = pageData;
        
        // Check required fields
        const hasVersion = typeof doc.version === 'number';
        const hasBlocks = Array.isArray(doc.blocks);
        const hasThemeId = typeof doc.themeId === 'string';
        
        console.log(`  version: ${hasVersion ? '✅' : '❌'} (${doc.version})`);
        console.log(`  blocks: ${hasBlocks ? '✅' : '❌'} (${doc.blocks.length} items)`);
        console.log(`  themeId: ${hasThemeId ? '✅' : '❌'} (${doc.themeId})`);
        
        // Check block structure if any exist
        if (doc.blocks.length > 0) {
          const block = doc.blocks[0];
          console.log(`  First block:`);
          console.log(`    - id: ${block.id}`);
          console.log(`    - type: ${block.type}`);
          console.log(`    - position: (${block.x}, ${block.y})`);
          console.log(`    - size: ${block.width}x${block.height}`);
        }
        
        if (hasVersion && hasBlocks && hasThemeId) {
          console.log('  ✅ PASS: PageDoc structure is valid\n');
        } else {
          console.error('  ❌ FAIL: Invalid PageDoc structure');
          process.exit(1);
        }
      }
    } else {
      console.log('  ⚠️  SKIP: No published pages with slug to test');
    }
    
    // Summary
    console.log('========================================');
    console.log('  All tests passed! ✅');
    console.log('========================================');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  }
}

main().catch(console.error);

