/**
 * Tests for Rate Limiter
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { RateLimiter } from '../rate-limiter';

describe('RateLimiter', () => {
  let limiter: RateLimiter;
  
  beforeEach(() => {
    limiter = new RateLimiter({
      messagesPerSecond: 5,
      messagesPerMinutePerGroup: 10,
    });
  });
  
  describe('acquire', () => {
    it('should allow messages under limit', async () => {
      const start = Date.now();
      
      await limiter.acquire('chat1', false);
      limiter.release('chat1', false);
      
      const elapsed = Date.now() - start;
      
      // Should be immediate
      expect(elapsed).toBeLessThan(100);
    });
    
    it('should throttle when over global limit', async () => {
      // Send messages up to limit
      for (let i = 0; i < 5; i++) {
        await limiter.acquire('chat1', false);
        limiter.release('chat1', false);
      }
      
      const start = Date.now();
      
      // This should wait
      await limiter.acquire('chat1', false);
      limiter.release('chat1', false);
      
      const elapsed = Date.now() - start;
      
      // Should have waited
      expect(elapsed).toBeGreaterThan(50);
    });
    
    it('should throttle groups separately', async () => {
      // Send messages to group up to limit
      for (let i = 0; i < 10; i++) {
        await limiter.acquire('group1', true);
        limiter.release('group1', true);
      }
      
      const start = Date.now();
      
      // This should wait
      await limiter.acquire('group1', true);
      limiter.release('group1', true);
      
      const elapsed = Date.now() - start;
      
      // Should have waited
      expect(elapsed).toBeGreaterThan(50);
    });
  });
  
  describe('getStats', () => {
    it('should return current rate stats', async () => {
      await limiter.acquire('chat1', false);
      limiter.release('chat1', false);
      
      await limiter.acquire('chat2', false);
      limiter.release('chat2', false);
      
      const stats = limiter.getStats();
      
      expect(stats.globalRate).toBeGreaterThan(0);
    });
  });
  
  describe('reset', () => {
    it('should reset all state', async () => {
      await limiter.acquire('chat1', false);
      limiter.release('chat1', false);
      
      limiter.reset();
      
      const stats = limiter.getStats();
      expect(stats.globalRate).toBe(0);
    });
  });
});
