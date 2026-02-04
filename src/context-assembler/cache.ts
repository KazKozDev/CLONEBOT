/**
 * Caching Layer
 * 
 * Caches assembled contexts with TTL.
 */

import type { AssembledContext } from './types';

// ============================================================================
// Types
// ============================================================================

export interface CacheEntry<T> {
  value: T;
  cachedAt: number;
  ttl: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
}

// ============================================================================
// Cache
// ============================================================================

export class Cache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;
  private defaultTTL: number;
  
  constructor(defaultTTL: number = 60_000) {
    this.defaultTTL = defaultTTL;
  }
  
  /**
   * Get value from cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }
    
    // Check if expired
    const age = Date.now() - entry.cachedAt;
    if (age > entry.ttl) {
      this.cache.delete(key);
      this.evictions++;
      this.misses++;
      return null;
    }
    
    this.hits++;
    return entry.value;
  }
  
  /**
   * Set value in cache
   */
  set(key: string, value: T, ttl?: number): void {
    this.cache.set(key, {
      value,
      cachedAt: Date.now(),
      ttl: ttl ?? this.defaultTTL,
    });
  }
  
  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }
  
  /**
   * Delete key from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }
  
  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.cachedAt;
      if (age > entry.ttl) {
        this.cache.delete(key);
        this.evictions++;
        cleaned++;
      }
    }
    
    return cleaned;
  }
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    };
  }
  
  /**
   * Get cache hit rate
   */
  getHitRate(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }
  
  /**
   * Reset statistics
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }
}

// ============================================================================
// Assembly Cache
// ============================================================================

export class AssemblyCache {
  private cache: Cache<AssembledContext>;
  
  constructor(ttl: number = 60_000) {
    this.cache = new Cache<AssembledContext>(ttl);
  }
  
  /**
   * Generate cache key from session and options
   */
  private generateKey(sessionId: string, options: Record<string, unknown>): string {
    // Simple key generation: sessionId + sorted options JSON
    const sortedOptions = Object.keys(options)
      .sort()
      .reduce((acc, key) => {
        acc[key] = options[key];
        return acc;
      }, {} as Record<string, unknown>);
    
    return `${sessionId}:${JSON.stringify(sortedOptions)}`;
  }
  
  /**
   * Get assembled context from cache
   */
  get(sessionId: string, options: Record<string, unknown> = {}): AssembledContext | null {
    const key = this.generateKey(sessionId, options);
    return this.cache.get(key);
  }
  
  /**
   * Set assembled context in cache
   */
  set(
    sessionId: string,
    options: Record<string, unknown>,
    context: AssembledContext,
    ttl?: number
  ): void {
    const key = this.generateKey(sessionId, options);
    this.cache.set(key, context, ttl);
  }
  
  /**
   * Invalidate cache for session
   */
  invalidate(sessionId: string): void {
    // Delete all entries starting with sessionId
    const prefix = `${sessionId}:`;
    
    for (const key of Array.from(this.cache['cache'].keys())) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
  
  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Clean up expired entries
   */
  cleanup(): number {
    return this.cache.cleanup();
  }
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return this.cache.getStats();
  }
  
  /**
   * Get cache hit rate
   */
  getHitRate(): number {
    return this.cache.getHitRate();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create generic cache
 */
export function createCache<T>(ttl?: number): Cache<T> {
  return new Cache<T>(ttl);
}

/**
 * Create assembly cache
 */
export function createAssemblyCache(ttl?: number): AssemblyCache {
  return new AssemblyCache(ttl);
}
