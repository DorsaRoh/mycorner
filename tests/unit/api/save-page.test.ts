/**
 * Unit tests for /api/save-page endpoint.
 * 
 * Tests the save page API handler.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  clearTestData,
  resetCounters,
  generateAnonToken,
} from '../../utils/testDb';
import {
  createTestSessionCookie,
  createTestDraftOwnerCookie,
  createMockRequest,
  createMockResponse,
} from '../../utils/session';

describe('/api/save-page', () => {
  beforeEach(async () => {
    resetCounters();
    await clearTestData();
  });

  afterEach(async () => {
    await clearTestData();
  });

  it('rejects non-POST requests', async () => {
    const handler = (await import('@/pages/api/save-page')).default;
    
    const req = createMockRequest('GET');
    const res = createMockResponse();
    
    await handler(req as any, res as any);
    
    expect(res.statusCode).toBe(405);
  });

  it('requires authentication or draft token', async () => {
    const handler = (await import('@/pages/api/save-page')).default;
    
    const req = createMockRequest('POST', { pageId: 'test-page' });
    const res = createMockResponse();
    
    await handler(req as any, res as any);
    
    expect(res.statusCode).toBe(401);
    expect((res.jsonBody as any).error).toContain('Authentication or draft token required');
  });

  it('requires pageId', async () => {
    const handler = (await import('@/pages/api/save-page')).default;
    const db = await import('@/server/db/sqlite');
    
    // Create user
    const user = db.upsertUserByGoogleSub({
      googleSub: 'test-sub',
      email: 'test@example.com',
      name: 'Test',
    });
    
    const req = createMockRequest(
      'POST',
      { blocks: [] },
      createTestSessionCookie(user.id)
    );
    const res = createMockResponse();
    
    await handler(req as any, res as any);
    
    expect(res.statusCode).toBe(400);
    expect((res.jsonBody as any).error).toContain('Page ID is required');
  });

  it('returns 404 for non-existent page', async () => {
    const handler = (await import('@/pages/api/save-page')).default;
    const db = await import('@/server/db/sqlite');
    
    const user = db.upsertUserByGoogleSub({
      googleSub: 'test-sub',
      email: 'test@example.com',
      name: 'Test',
    });
    
    const req = createMockRequest(
      'POST',
      { pageId: 'non-existent' },
      createTestSessionCookie(user.id)
    );
    const res = createMockResponse();
    
    await handler(req as any, res as any);
    
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 for non-owner', async () => {
    const handler = (await import('@/pages/api/save-page')).default;
    const db = await import('@/server/db/sqlite');
    
    const owner = db.upsertUserByGoogleSub({
      googleSub: 'owner-sub',
      email: 'owner@example.com',
      name: 'Owner',
    });
    
    const otherUser = db.upsertUserByGoogleSub({
      googleSub: 'other-sub',
      email: 'other@example.com',
      name: 'Other',
    });
    
    const page = db.createPage(owner.id, 'Test Page', owner.id);
    
    const req = createMockRequest(
      'POST',
      { pageId: page.id, blocks: [] },
      createTestSessionCookie(otherUser.id)
    );
    const res = createMockResponse();
    
    await handler(req as any, res as any);
    
    expect(res.statusCode).toBe(403);
  });

  it('saves page for authenticated owner', async () => {
    const handler = (await import('@/pages/api/save-page')).default;
    const db = await import('@/server/db/sqlite');
    
    const user = db.upsertUserByGoogleSub({
      googleSub: 'test-sub',
      email: 'test@example.com',
      name: 'Test',
    });
    
    const page = db.createPage(user.id, 'Test Page', user.id);
    
    const blocks = [
      { id: 'blk1', type: 'text', x: 0, y: 0, width: 100, height: 50, content: 'Hello' },
    ];
    
    const req = createMockRequest(
      'POST',
      { pageId: page.id, blocks, baseServerRevision: 1 },
      createTestSessionCookie(user.id)
    );
    const res = createMockResponse();
    
    await handler(req as any, res as any);
    
    expect(res.statusCode).toBe(200);
    expect((res.jsonBody as any).success).toBe(true);
    expect((res.jsonBody as any).conflict).toBe(false);
    
    // Verify saved
    const savedPage = db.getPageById(page.id);
    const content = JSON.parse(savedPage!.content);
    expect(content).toHaveLength(1);
    expect(content[0].id).toBe('blk1');
  });

  it('saves page for anonymous owner with draft token', async () => {
    const handler = (await import('@/pages/api/save-page')).default;
    const db = await import('@/server/db/sqlite');
    
    const anonToken = generateAnonToken();
    const page = db.createPage(anonToken, 'Anonymous Draft');
    
    const blocks = [
      { id: 'blk1', type: 'text', x: 0, y: 0, width: 100, height: 50, content: 'Anon content' },
    ];
    
    const req = createMockRequest(
      'POST',
      { pageId: page.id, blocks, baseServerRevision: 1 },
      createTestDraftOwnerCookie(anonToken)
    );
    const res = createMockResponse();
    
    await handler(req as any, res as any);
    
    expect(res.statusCode).toBe(200);
    expect((res.jsonBody as any).success).toBe(true);
  });

  it('prevents anonymous edit after page is claimed', async () => {
    const handler = (await import('@/pages/api/save-page')).default;
    const db = await import('@/server/db/sqlite');
    
    const anonToken = generateAnonToken();
    const page = db.createPage(anonToken, 'Anonymous Draft');
    
    // User claims the page
    const user = db.upsertUserByGoogleSub({
      googleSub: 'test-sub',
      email: 'test@example.com',
      name: 'Test',
    });
    db.claimAnonymousPages(anonToken, user.id);
    
    // Try to edit with old anon token
    const req = createMockRequest(
      'POST',
      { pageId: page.id, blocks: [] },
      createTestDraftOwnerCookie(anonToken)
    );
    const res = createMockResponse();
    
    await handler(req as any, res as any);
    
    // Should fail because page is now claimed
    expect(res.statusCode).toBe(403);
  });

  it('detects conflicts', async () => {
    const handler = (await import('@/pages/api/save-page')).default;
    const db = await import('@/server/db/sqlite');
    
    const user = db.upsertUserByGoogleSub({
      googleSub: 'test-sub',
      email: 'test@example.com',
      name: 'Test',
    });
    
    const page = db.createPage(user.id, 'Test Page', user.id);
    
    // Simulate another update
    db.updatePage(page.id, { content: JSON.stringify([]) });
    
    // Try to save with stale revision
    const req = createMockRequest(
      'POST',
      { pageId: page.id, blocks: [], baseServerRevision: 1 },
      createTestSessionCookie(user.id)
    );
    const res = createMockResponse();
    
    await handler(req as any, res as any);
    
    expect(res.statusCode).toBe(200);
    expect((res.jsonBody as any).success).toBe(false);
    expect((res.jsonBody as any).conflict).toBe(true);
  });
});

