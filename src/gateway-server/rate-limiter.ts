/**
 * Rate Limiting Middleware
 * 
 * Sliding window rate limiter with per-IP and per-identity limits
 */

import type { Request, Response, Middleware, RateLimitConfig, RateLimitResult, RateLimitEntry } from './types';
import { RateLimitError } from './types';

/**
 * Rate Limiter
 */
export class RateLimiter {
  private entries = new Map<string, RateLimitEntry>();
  private config: RateLimitConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: RateLimitConfig) {
    this.config = config;

    // Cleanup old entries periodically
    this.cleanupTimer = setInterval(() => this.cleanup(), 60000); // Every minute
    // Don't keep the event loop alive (important for Jest)
    this.cleanupTimer.unref?.();
  }

  /**
   * Check rate limit
   */
  check(key: string, limit?: number, windowMs?: number): RateLimitResult {
    const effectiveLimit = limit ?? this.config.defaultLimit;
    const effectiveWindow = windowMs ?? this.config.windowMs;

    const now = Date.now();
    const resetAt = now + effectiveWindow;

    // Get or create entry
    let entry = this.entries.get(key);

    // Reset if window expired
    if (!entry || now >= entry.resetAt) {
      entry = {
        count: 0,
        resetAt,
      };
      this.entries.set(key, entry);
    }

    // Increment count
    entry.count++;

    const allowed = entry.count <= effectiveLimit;
    const remaining = Math.max(0, effectiveLimit - entry.count);

    return {
      allowed,
      remaining,
      resetAt: entry.resetAt,
      limit: effectiveLimit,
    };
  }

  /**
   * Reset limit for key
   */
  reset(key: string): void {
    this.entries.delete(key);
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    
    for (const [key, entry] of this.entries.entries()) {
      if (now >= entry.resetAt) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * Get all entries (for debugging)
   */
  getEntries(): Map<string, RateLimitEntry> {
    return new Map(this.entries);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries.clear();
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

/**
 * Create rate limiting middleware
 */
export function createRateLimitMiddleware(config: RateLimitConfig): Middleware {
  if (!config.enabled) {
    // Pass-through if disabled
    return async (_req, _res, next) => {
      await next();
    };
  }

  const limiter = new RateLimiter(config);

  return async (req: Request, res: Response, next) => {
    // Determine rate limit key
    let key: string;
    
    if (req.auth?.authenticated) {
      // Per-identity limiting
      key = `identity:${req.auth.identity}`;
    } else {
      // Per-IP limiting
      key = `ip:${req.ip}`;
    }

    // Get endpoint-specific limit
    const endpointConfig = config.endpoints?.[req.path];
    const limit = endpointConfig?.limit;
    const windowMs = endpointConfig?.window ? endpointConfig.window * 1000 : undefined;

    // Check limit
    const result = limiter.check(key, limit, windowMs);

    // Set rate limit headers
    res.header('X-RateLimit-Limit', result.limit);
    res.header('X-RateLimit-Remaining', result.remaining);
    res.header('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Rate limit exceeded',
          details: {
            limit: result.limit,
            resetAt: result.resetAt,
          },
        },
      });
      return;
    }

    await next();
  };
}

/**
 * Factory function
 */
export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  return new RateLimiter(config);
}
