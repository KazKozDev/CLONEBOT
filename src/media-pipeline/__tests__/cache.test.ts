/**
 * Cache Tests
 */

import { ResultCache } from '../cache';
import { MediaResult } from '../types';

describe('ResultCache', () => {
  let cache: ResultCache;
  
  beforeEach(() => {
    cache = new ResultCache(1024 * 1024, 60000); // 1MB, 1 minute TTL
  });
  
  const createMockResult = (content: string): MediaResult => ({
    success: true,
    type: 'audio',
    content,
    data: { transcript: content },
    metadata: {
      provider: 'test',
      processingTime: 100,
      cached: false,
      originalSize: 1000,
      truncated: false,
    },
  });
  
  describe('generateKey', () => {
    it('should generate consistent key for same buffer', () => {
      const buffer = Buffer.from('test data');
      const key1 = cache.generateKey(buffer, 'provider1');
      const key2 = cache.generateKey(buffer, 'provider1');
      
      expect(key1).toBe(key2);
    });
    
    it('should generate different key for different providers', () => {
      const buffer = Buffer.from('test data');
      const key1 = cache.generateKey(buffer, 'provider1');
      const key2 = cache.generateKey(buffer, 'provider2');
      
      expect(key1).not.toBe(key2);
    });
    
    it('should include options in key', () => {
      const buffer = Buffer.from('test data');
      const key1 = cache.generateKey(buffer, 'provider', { language: 'en' });
      const key2 = cache.generateKey(buffer, 'provider', { language: 'ru' });
      
      expect(key1).not.toBe(key2);
    });
  });
  
  describe('get/set', () => {
    it('should store and retrieve result', () => {
      const key = 'test-key';
      const result = createMockResult('test content');
      
      cache.set(key, result);
      const retrieved = cache.get(key);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.content).toBe('test content');
      expect(retrieved?.metadata.cached).toBe(true);
    });
    
    it('should return null for non-existent key', () => {
      const result = cache.get('non-existent');
      
      expect(result).toBeNull();
    });
    
    it('should update hit count', () => {
      const key = 'test-key';
      const result = createMockResult('test');
      
      cache.set(key, result);
      
      cache.get(key);
      cache.get(key);
      cache.get(key);
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(3);
    });
    
    it('should track cache misses', () => {
      cache.get('missing-1');
      cache.get('missing-2');
      
      const stats = cache.getStats();
      expect(stats.misses).toBe(2);
    });
  });
  
  describe('TTL', () => {
    it('should expire entries after TTL', async () => {
      const cache = new ResultCache(1024 * 1024, 100); // 100ms TTL
      const result = createMockResult('test');
      
      cache.set('key', result);
      
      // Should exist immediately
      expect(cache.get('key')).toBeDefined();
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should be expired
      expect(cache.get('key')).toBeNull();
    });
  });
  
  describe('LRU eviction', () => {
    it('should evict least recently used when full', () => {
      const cache = new ResultCache(500, 60000); // Small size
      
      const result1 = createMockResult('a'.repeat(100));
      const result2 = createMockResult('b'.repeat(100));
      const result3 = createMockResult('c'.repeat(100));
      
      cache.set('key1', result1);
      cache.set('key2', result2);
      
      // Access key1 to make it more recently used
      cache.get('key1');
      
      // Add key3, should evict key2 (least recently used)
      cache.set('key3', result3);
      
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false); // Evicted
      expect(cache.has('key3')).toBe(true);
    });
  });
  
  describe('clear', () => {
    it('should clear all entries', () => {
      cache.set('key1', createMockResult('test1'));
      cache.set('key2', createMockResult('test2'));
      
      cache.clear();
      
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
    });
  });
});
