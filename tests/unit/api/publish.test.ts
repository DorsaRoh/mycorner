/**
 * Unit tests for /api/publish endpoint.
 * 
 * Tests the publish API handler.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  clearTestData,
  resetCounters,
} from '../../utils/testDb';
import {
  createTestSessionCookie,
  createMockRequest,
  createMockResponse,
} from '../../utils/session';

// Mock storage and CDN modules
vi.mock('@/server/storage/client', () => ({
  uploadPageHtml: vi.fn().mockResolvedValue({ key: 'test-key', success: true }),
  isUploadConfigured: vi.fn().mockReturnValue(false),
  requirePublicPagesConfigured: vi.fn().mockReturnValue(null),
  isValidSlug: vi.fn().mockReturnValue(true),
  getMissingStorageEnvVars: vi.fn().mockReturnValue([]),
  REQUIRED_STORAGE_ENV_VARS: ['SUPABASE_URL', 'SUPABASE_KEY'],
}));

vi.mock('@/server/cdn/purge', () => ({
  purgePage: vi.fn().mockResolvedValue({ success: true }),
  isPurgeConfigured: vi.fn().mockReturnValue(false),
}));

describe('/api/publish', () => {
  beforeEach(async () => {
    resetCounters();
    await clearTestData();
  });

  afterEach(async () => {
    await clearTestData();
    vi.clearAllMocks();
  });

  it('rejects non-POST requests', async () => {
    const handler = (await import('@/pages/api/publish')).default;
    
    const req = createMockRequest('GET');
    const res = createMockResponse();
    
    await handler(req as any, res as any);
    
    expect(res.statusCode).toBe(405);
  });

  it('requires authentication', async () => {
    const handler = (await import('@/pages/api/publish')).default;
    
    const req = createMockRequest('POST', { doc: { version: 1, blocks: [] } });
    const res = createMockResponse();
    
    await handler(req as any, res as any);
    
    expect(res.statusCode).toBe(401);
    expect((res.jsonBody as any).error).toContain('Authentication required');
  });

  it('requires username to be set', async () => {
    const handler = (await import('@/pages/api/publish')).default;
    const db = await import('@/server/db/sqlite');
    
    const user = db.upsertUserByGoogleSub({
      googleSub: 'test-sub',
      email: 'test@example.com',
      name: 'Test',
    });
    // Note: Not setting username
    
    const req = createMockRequest(
      'POST',
      { doc: { version: 1, blocks: [] } },
      createTestSessionCookie(user.id)
    );
    
    // Mock revalidate
    const res = {
      ...createMockResponse(),
      revalidate: vi.fn().mockResolvedValue(undefined),
    };
    
    await handler(req as any, res as any);
    
    expect(res.statusCode).toBe(400);
    expect((res.jsonBody as any).code).toBe('USERNAME_REQUIRED');
  });

  it('validates PageDoc schema', async () => {
    const handler = (await import('@/pages/api/publish')).default;
    const db = await import('@/server/db/sqlite');
    
    const user = db.upsertUserByGoogleSub({
      googleSub: 'test-sub',
      email: 'test@example.com',
      name: 'Test',
    });
    db.setUsername(user.id, 'testuser');
    
    const req = createMockRequest(
      'POST',
      { doc: { version: 2, blocks: [] } }, // Invalid version
      createTestSessionCookie(user.id)
    );
    
    const res = {
      ...createMockResponse(),
      revalidate: vi.fn().mockResolvedValue(undefined),
    };
    
    await handler(req as any, res as any);
    
    expect(res.statusCode).toBe(400);
    expect((res.jsonBody as any).error).toContain('Invalid request');
  });

  it('rejects too many blocks', async () => {
    const handler = (await import('@/pages/api/publish')).default;
    const db = await import('@/server/db/sqlite');
    
    const user = db.upsertUserByGoogleSub({
      googleSub: 'test-sub',
      email: 'test@example.com',
      name: 'Test',
    });
    db.setUsername(user.id, 'testuser');
    
    // Create 51 blocks (over limit of 50)
    const blocks = Array.from({ length: 51 }, (_, i) => ({
      id: `blk_${i}`,
      type: 'text',
      x: 0,
      y: i * 100,
      width: 100,
      height: 50,
      content: { text: `Block ${i}` },
    }));
    
    const req = createMockRequest(
      'POST',
      { doc: { version: 1, blocks } },
      createTestSessionCookie(user.id)
    );
    
    const res = {
      ...createMockResponse(),
      revalidate: vi.fn().mockResolvedValue(undefined),
    };
    
    await handler(req as any, res as any);
    
    expect(res.statusCode).toBe(400);
    expect((res.jsonBody as any).error).toContain('Too many blocks');
  });

  it('publishes successfully with valid data', async () => {
    const handler = (await import('@/pages/api/publish')).default;
    const db = await import('@/server/db/sqlite');
    
    const user = db.upsertUserByGoogleSub({
      googleSub: 'test-sub',
      email: 'test@example.com',
      name: 'Test',
    });
    db.setUsername(user.id, 'testuser');
    
    // Create a page for the user
    db.createPage(user.id, 'Test Page', user.id);
    
    const doc = {
      version: 1,
      blocks: [
        {
          id: 'blk_1',
          type: 'text',
          x: 100,
          y: 100,
          width: 200,
          height: 50,
          content: { text: 'Hello World' },
        },
      ],
    };
    
    const req = createMockRequest(
      'POST',
      { doc },
      createTestSessionCookie(user.id)
    );
    
    const res = {
      ...createMockResponse(),
      revalidate: vi.fn().mockResolvedValue(undefined),
    };
    
    await handler(req as any, res as any);
    
    expect(res.statusCode).toBe(200);
    expect((res.jsonBody as any).success).toBe(true);
    expect((res.jsonBody as any).slug).toBe('testuser');
    expect((res.jsonBody as any).url).toBe('/testuser');
    expect((res.jsonBody as any).publicUrl).toContain('/testuser');
    
    // Verify ISR revalidation was called
    expect(res.revalidate).toHaveBeenCalledWith('/testuser');
    
    // Verify page is published in DB
    const page = db.getPageBySlug('testuser');
    expect(page).toBeTruthy();
    expect(page!.is_published).toBe(1);
    expect(page!.published_content).toBeTruthy();
  });

  it('uses username as slug', async () => {
    const handler = (await import('@/pages/api/publish')).default;
    const db = await import('@/server/db/sqlite');
    
    const user = db.upsertUserByGoogleSub({
      googleSub: 'test-sub',
      email: 'test@example.com',
      name: 'Test',
    });
    db.setUsername(user.id, 'myuniquename');
    db.createPage(user.id, 'Test Page', user.id);
    
    const req = createMockRequest(
      'POST',
      { doc: { version: 1, blocks: [] } },
      createTestSessionCookie(user.id)
    );
    
    const res = {
      ...createMockResponse(),
      revalidate: vi.fn().mockResolvedValue(undefined),
    };
    
    await handler(req as any, res as any);
    
    expect((res.jsonBody as any).slug).toBe('myuniquename');
    expect((res.jsonBody as any).url).toBe('/myuniquename');
  });
});

