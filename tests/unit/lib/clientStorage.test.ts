/**
 * Unit tests for client storage utilities.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  safeJsonParse,
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
  getStorageVersion,
  setStorageVersion,
  reconcileClientStorage,
  clearAppStorage,
  STORAGE_VERSION,
} from '@/lib/clientStorage';

// Mock localStorage
const createMockStorage = () => {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
    get length() { return Object.keys(store).length; },
    _store: store,
  };
};

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse('{"foo": "bar"}')).toEqual({ foo: 'bar' });
    expect(safeJsonParse('[1, 2, 3]')).toEqual([1, 2, 3]);
    expect(safeJsonParse('"hello"')).toBe('hello');
    expect(safeJsonParse('123')).toBe(123);
    expect(safeJsonParse('true')).toBe(true);
    expect(safeJsonParse('null')).toBe(null);
  });

  it('returns null for invalid JSON', () => {
    expect(safeJsonParse('{')).toBe(null);
    expect(safeJsonParse('not json')).toBe(null);
    expect(safeJsonParse('[1, 2,')).toBe(null);
    expect(safeJsonParse('undefined')).toBe(null);
  });

  it('returns null for non-string input', () => {
    expect(safeJsonParse(null)).toBe(null);
    expect(safeJsonParse(undefined)).toBe(null);
    // @ts-expect-error - testing invalid input
    expect(safeJsonParse(123)).toBe(null);
    // @ts-expect-error - testing invalid input
    expect(safeJsonParse({})).toBe(null);
  });

  it('handles empty string', () => {
    expect(safeJsonParse('')).toBe(null);
  });
});

describe('storage utilities', () => {
  let mockStorage: ReturnType<typeof createMockStorage>;
  let originalLocalStorage: typeof localStorage;
  let originalWindow: typeof window;

  beforeEach(() => {
    mockStorage = createMockStorage();
    originalLocalStorage = globalThis.localStorage;
    originalWindow = globalThis.window;
    
    // @ts-expect-error - mocking global
    globalThis.localStorage = mockStorage;
    // @ts-expect-error - mocking global
    globalThis.window = {};
  });

  afterEach(() => {
    globalThis.localStorage = originalLocalStorage;
    globalThis.window = originalWindow;
  });

  describe('safeGetItem', () => {
    it('returns item from storage', () => {
      mockStorage._store['test'] = 'value';
      expect(safeGetItem('test')).toBe('value');
    });

    it('returns null for missing key', () => {
      expect(safeGetItem('missing')).toBe(null);
    });

    it('returns null when storage throws', () => {
      mockStorage.getItem = vi.fn(() => { throw new Error('Storage error'); });
      expect(safeGetItem('test')).toBe(null);
    });
  });

  describe('safeSetItem', () => {
    it('sets item in storage', () => {
      expect(safeSetItem('test', 'value')).toBe(true);
      expect(mockStorage._store['test']).toBe('value');
    });

    it('returns false when storage throws', () => {
      mockStorage.setItem = vi.fn(() => { throw new Error('Storage error'); });
      expect(safeSetItem('test', 'value')).toBe(false);
    });
  });

  describe('safeRemoveItem', () => {
    it('removes item from storage', () => {
      mockStorage._store['test'] = 'value';
      expect(safeRemoveItem('test')).toBe(true);
      expect(mockStorage._store['test']).toBeUndefined();
    });

    it('returns false when storage throws', () => {
      mockStorage.removeItem = vi.fn(() => { throw new Error('Storage error'); });
      expect(safeRemoveItem('test')).toBe(false);
    });
  });

  describe('storage version', () => {
    it('getStorageVersion returns 0 when not set', () => {
      expect(getStorageVersion()).toBe(0);
    });

    it('getStorageVersion returns parsed version', () => {
      mockStorage._store['yourcorner:storage_version'] = '2';
      expect(getStorageVersion()).toBe(2);
    });

    it('getStorageVersion returns 0 for invalid value', () => {
      mockStorage._store['yourcorner:storage_version'] = 'invalid';
      expect(getStorageVersion()).toBe(0);
    });

    it('setStorageVersion stores version', () => {
      setStorageVersion(2);
      expect(mockStorage._store['yourcorner:storage_version']).toBe('2');
    });
  });

  describe('clearAppStorage', () => {
    beforeEach(() => {
      mockStorage._store['yourcorner:draft:v1'] = '{"doc":{}}';
      mockStorage._store['yourcorner:other'] = 'value';
      mockStorage._store['yourcorner:storage_version'] = '1';
      mockStorage._store['mycorner:legacy'] = 'old';
      mockStorage._store['unrelated'] = 'keep';
    });

    it('clears app keys while preserving draft by default', () => {
      clearAppStorage();
      
      expect(mockStorage._store['yourcorner:draft:v1']).toBe('{"doc":{}}');
      expect(mockStorage._store['yourcorner:other']).toBeUndefined();
      expect(mockStorage._store['mycorner:legacy']).toBeUndefined();
      expect(mockStorage._store['unrelated']).toBe('keep');
    });

    it('clears draft when preserveDraft is false', () => {
      clearAppStorage({ preserveDraft: false });
      
      expect(mockStorage._store['yourcorner:draft:v1']).toBeUndefined();
    });
  });

  describe('reconcileClientStorage', () => {
    it('sets version when not present', () => {
      const result = reconcileClientStorage();
      
      expect(result.versionMismatch).toBe(true);
      expect(result.previousVersion).toBe(0);
      expect(result.currentVersion).toBe(STORAGE_VERSION);
      expect(mockStorage._store['yourcorner:storage_version']).toBe(String(STORAGE_VERSION));
    });

    it('clears stale keys on version mismatch', () => {
      mockStorage._store['yourcorner:storage_version'] = '1';
      mockStorage._store['yourcorner:stale_key'] = 'value';
      mockStorage._store['yourcorner:draft:v1'] = '{"doc":{}}';
      
      const result = reconcileClientStorage();
      
      expect(result.versionMismatch).toBe(true);
      expect(result.clearedKeys).toContain('yourcorner:stale_key');
      expect(mockStorage._store['yourcorner:stale_key']).toBeUndefined();
      expect(mockStorage._store['yourcorner:draft:v1']).toBe('{"doc":{}}');
    });

    it('does nothing when version matches', () => {
      mockStorage._store['yourcorner:storage_version'] = String(STORAGE_VERSION);
      mockStorage._store['yourcorner:some_key'] = 'value';
      
      const result = reconcileClientStorage();
      
      expect(result.versionMismatch).toBe(false);
      expect(result.clearedKeys).toEqual([]);
      expect(mockStorage._store['yourcorner:some_key']).toBe('value');
    });

    it('handles errors gracefully', () => {
      mockStorage.getItem = vi.fn(() => { throw new Error('Storage error'); });
      
      // Should not throw
      const result = reconcileClientStorage();
      
      // When getItem throws, safeGetItem returns null, getStorageVersion returns 0
      // 0 !== STORAGE_VERSION (2), so versionMismatch is true, which is correct behavior
      expect(result.versionMismatch).toBe(true);
      expect(result.previousVersion).toBe(0);
    });
  });
});

describe('safeJsonParse with complex objects', () => {
  it('parses nested objects', () => {
    const complex = {
      doc: {
        version: 1,
        blocks: [{ id: 'b1', type: 'text', x: 0, y: 0, width: 100, height: 50 }],
      },
      updatedAt: 1234567890,
      createdAt: 1234567800,
    };
    
    expect(safeJsonParse(JSON.stringify(complex))).toEqual(complex);
  });

  it('handles malformed draft data', () => {
    // Missing closing brace
    expect(safeJsonParse('{"doc":{"version":1}')).toBe(null);
    
    // Invalid unicode
    expect(safeJsonParse('{"doc":"\uD800"}')).not.toBe(null); // This is valid JSON
    
    // Truncated string
    expect(safeJsonParse('{"doc":"truncated')).toBe(null);
  });
});

