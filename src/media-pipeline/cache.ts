/**
 * Result Cache
 * 
 * LRU cache for media processing results
 */

import { MediaResult, CachedResult, CacheStats } from './types';
import { createHash } from 'crypto';

// ============================================================================
// Cache Entry
// ============================================================================

interface CacheEntry {
  key: string;
  result: MediaResult;
  timestamp: number;
  hits: number;
  size: number;
  ttl: number;
}

// ============================================================================
// Result Cache
// ============================================================================

export class ResultCache {
  private cache: Map<string, CacheEntry> = new Map();
  private stats: CacheStats = {
    size: 0,
    maxSize: 500 * 1024 * 1024, // 500MB default
    hits: 0,
    misses: 0,
    evictions: 0,
  };
  
  constructor(
    private readonly maxSize: number = 500 * 1024 * 1024,
    private readonly defaultTTL: number = 86400000 // 24 hours
  ) {
    this.stats.maxSize = maxSize;
  }
  
  /**
   * Generate cache key
   */
  generateKey(
    buffer: Buffer,
    provider: string,
    options?: any
  ): string {
    // Hash first 1MB and size for content identity
    const sampleSize = Math.min(buffer.length, 1024 * 1024);
    const sample = buffer.slice(0, sampleSize);
    const contentHash = createHash('sha256')
      .update(sample)
      .update(String(buffer.length))
      .digest('hex');
    
    // Include provider and options
    const optionsHash = options ? createHash('sha256')
      .update(JSON.stringify(options))
      .digest('hex')
      .slice(0, 8) : '';
    
    return `${provider}:${contentHash}${optionsHash ? ':' + optionsHash : ''}`;
  }
  
  /**
   * Get cached result
   */
  get(key: string): MediaResult | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    // Check TTL
    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      this.invalidate(key);
      this.stats.misses++;
      return null;
    }
    
    // Update hits
    entry.hits++;
    this.stats.hits++;
    
    // Mark as cached
    return {
      ...entry.result,
      metadata: {
        ...entry.result.metadata,
        cached: true,
      },
    };
  }
  
  /**
   * Set cache entry
   */
  set(key: string, result: MediaResult, ttl?: number): void {
    // Estimate size
    const size = this.estimateSize(result);
    
    // Check if we need to evict
    while (this.stats.size + size > this.stats.maxSize && this.cache.size > 0) {
      this.evictLRU();
    }
    
    // Add entry
    const entry: CacheEntry = {
      key,
      result,
      timestamp: Date.now(),
      hits: 0,
      size,
      ttl: ttl || this.defaultTTL,
    };
    
    this.cache.set(key, entry);
    this.stats.size += size;
  }
  
  /**
   * Check if key exists
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }
  
  /**
   * Invalidate cache entry
   */
  invalidate(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key);
      this.stats.size -= entry.size;
    }
  }
  
  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.evictions = 0;
  }
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }
  
  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    let lowestHits = Infinity;
    
    // Find LRU entry (combination of age and hits)
    for (const [key, entry] of this.cache.entries()) {
      const score = entry.timestamp + (entry.hits * 60000); // Bias towards recently used
      
      if (score < oldestTime) {
        oldestTime = score;
        oldestKey = key;
        lowestHits = entry.hits;
      }
    }
    
    if (oldestKey) {
      this.invalidate(oldestKey);
      this.stats.evictions++;
    }
  }
  
  /**
   * Estimate size of result
   */
  private estimateSize(result: MediaResult): number {
    // Rough estimation
    const contentSize = result.content.length * 2; // UTF-16
    const dataSize = JSON.stringify(result.data).length * 2;
    return contentSize + dataSize + 1024; // +1KB overhead
  }
}
