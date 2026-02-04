/**
 * Session Lock Manager Tests
 */

import { SessionLockManager } from '../session-lock';

describe('SessionLockManager', () => {
  let manager: SessionLockManager;
  
  beforeEach(() => {
    manager = new SessionLockManager();
  });
  
  describe('Lock Acquisition', () => {
    it('should acquire lock immediately if available', async () => {
      const lock = await manager.acquire('session-1', 'run-1');
      
      expect(lock.sessionId).toBe('session-1');
      expect(lock.runId).toBe('run-1');
      expect(lock.acquiredAt).toBeDefined();
      expect(manager.isLocked('session-1')).toBe(true);
    });
    
    it('should queue waiters if locked', async () => {
      const lock1 = await manager.acquire('session-1', 'run-1');
      
      const lock2Promise = manager.acquire('session-1', 'run-2');
      
      // Should be waiting
      expect(manager.getWaiters('session-1')).toContain('run-2');
      
      // Release first lock
      lock1.release();
      
      // Second lock should be acquired
      const lock2 = await lock2Promise;
      expect(lock2.runId).toBe('run-2');
      expect(manager.getHolder('session-1')).toBe('run-2');
    });
    
    it('should timeout if waiting too long', async () => {
      await manager.acquire('session-1', 'run-1');
      
      await expect(
        manager.acquire('session-1', 'run-2', 100)
      ).rejects.toThrow('Lock acquisition timeout');
    });
  });
  
  describe('Lock Release', () => {
    it('should release lock', async () => {
      const lock = await manager.acquire('session-1', 'run-1');
      
      lock.release();
      
      expect(manager.isLocked('session-1')).toBe(false);
      expect(manager.getHolder('session-1')).toBeNull();
    });
    
    it('should only release if holder', async () => {
      await manager.acquire('session-1', 'run-1');
      
      manager.release('session-1', 'run-2');
      
      expect(manager.isLocked('session-1')).toBe(true);
      expect(manager.getHolder('session-1')).toBe('run-1');
    });
    
    it('should give lock to next waiter', async () => {
      const lock1 = await manager.acquire('session-1', 'run-1');
      const lock2Promise = manager.acquire('session-1', 'run-2');
      
      lock1.release();
      
      const lock2 = await lock2Promise;
      expect(manager.getHolder('session-1')).toBe('run-2');
    });
  });
  
  describe('Force Release', () => {
    it('should force release lock', async () => {
      await manager.acquire('session-1', 'run-1');
      
      manager.forceRelease('session-1');
      
      expect(manager.isLocked('session-1')).toBe(false);
    });
  });
});
