/**
 * Unit tests for src/lib/schema/page.ts
 * 
 * Tests PageDoc schema validation and helpers.
 */

import { describe, it, expect } from 'vitest';
import { 
  PageDocSchema, 
  validatePageDoc, 
  createEmptyPageDoc,
  generateBlockId,
  convertLegacyBlock,
} from '@/lib/schema/page';

describe('PageDoc Schema', () => {
  describe('createEmptyPageDoc', () => {
    it('returns valid PageDoc', () => {
      const doc = createEmptyPageDoc();
      const result = PageDocSchema.safeParse(doc);
      expect(result.success).toBe(true);
    });

    it('has version 1 and empty blocks', () => {
      const doc = createEmptyPageDoc();
      expect(doc.version).toBe(1);
      expect(doc.blocks).toHaveLength(0);
    });
  });

  describe('PageDocSchema validation', () => {
    it('requires version 1', () => {
      const doc = { version: 2, blocks: [] };
      const result = PageDocSchema.safeParse(doc);
      expect(result.success).toBe(false);
    });

    it('accepts valid text block', () => {
      const doc = {
        version: 1,
        blocks: [{
          id: 'test-1',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          content: { text: 'Hello world' },
        }],
      };
      const result = PageDocSchema.safeParse(doc);
      expect(result.success).toBe(true);
    });

    it('accepts valid link block', () => {
      const doc = {
        version: 1,
        blocks: [{
          id: 'test-1',
          type: 'link',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          content: { label: 'My Site', url: 'https://example.com' },
        }],
      };
      const result = PageDocSchema.safeParse(doc);
      expect(result.success).toBe(true);
    });

    it('accepts valid image block', () => {
      const doc = {
        version: 1,
        blocks: [{
          id: 'test-1',
          type: 'image',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          content: { url: 'https://example.com/image.jpg', alt: 'My image' },
        }],
      };
      const result = PageDocSchema.safeParse(doc);
      expect(result.success).toBe(true);
    });

    it('rejects invalid block type', () => {
      const doc = {
        version: 1,
        blocks: [{
          id: 'test-1',
          type: 'video',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          content: {},
        }],
      };
      const result = PageDocSchema.safeParse(doc);
      expect(result.success).toBe(false);
    });

    it('accepts block with style', () => {
      const doc = {
        version: 1,
        blocks: [{
          id: 'test-1',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          content: { text: 'Hello' },
          style: {
            align: 'center',
            card: true,
            radius: 'md',
            shadow: 'sm',
          },
        }],
      };
      const result = PageDocSchema.safeParse(doc);
      expect(result.success).toBe(true);
    });

    it('rejects invalid style values', () => {
      const doc = {
        version: 1,
        blocks: [{
          id: 'test-1',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          content: { text: 'Hello' },
          style: {
            align: 'justify', // invalid
          },
        }],
      };
      const result = PageDocSchema.safeParse(doc);
      expect(result.success).toBe(false);
    });
  });

  describe('validatePageDoc', () => {
    it('returns success for valid doc', () => {
      const doc = createEmptyPageDoc();
      const result = validatePageDoc(doc);
      expect(result.success).toBe(true);
    });

    it('returns error for invalid doc', () => {
      const result = validatePageDoc({ version: 2 });
      expect(result.success).toBe(false);
      expect('error' in result).toBe(true);
      expect(typeof (result as { error: string }).error).toBe('string');
    });
  });

  describe('generateBlockId', () => {
    it('produces unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateBlockId());
      }
      expect(ids.size).toBe(100);
    });

    it('starts with blk_', () => {
      const id = generateBlockId();
      expect(id.startsWith('blk_')).toBe(true);
    });
  });

  describe('convertLegacyBlock', () => {
    it('handles TEXT block', () => {
      const legacy = {
        id: 'test-1',
        type: 'TEXT' as const,
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        content: 'Hello world',
      };
      const result = convertLegacyBlock(legacy);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('text');
      expect((result as any).content.text).toBe('Hello world');
    });

    it('handles IMAGE block', () => {
      const legacy = {
        id: 'test-1',
        type: 'IMAGE' as const,
        x: 10,
        y: 20,
        width: 100,
        height: 100,
        content: 'https://example.com/image.jpg',
      };
      const result = convertLegacyBlock(legacy);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('image');
      expect((result as any).content.url).toBe('https://example.com/image.jpg');
    });

    it('handles LINK block', () => {
      const legacy = {
        id: 'test-1',
        type: 'LINK' as const,
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        content: JSON.stringify({ label: 'Click me', url: 'https://example.com' }),
      };
      const result = convertLegacyBlock(legacy);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('link');
      expect((result as any).content.label).toBe('Click me');
      expect((result as any).content.url).toBe('https://example.com');
    });
  });
});

