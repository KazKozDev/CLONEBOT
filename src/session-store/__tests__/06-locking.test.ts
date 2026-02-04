/**
 * Tests for locking mechanism
 */

import { LockManager, withLock } from '../LockManager';
import { InMemoryFileSystem } from '../FileSystem';

describe('LockManager', () => {
  let fs: InMemoryFileSystem;
  let lockManager: LockManager;

  beforeEach(() => {
    fs = new InMemoryFileSystem();
    lockManager = new LockManager(fs, {
      lockTimeoutMs: 1000,
      checkIntervalMs: 100
    });
  });

  describe('acquire', () => {
    it('should acquire lock for session', async () => {
      const result = await lockManager.acquire('session-1', 'owner-1');
      
      expect(result.acquired).toBe(true);
      expect(result.lock).toBeDefined();
      expect(result.lock?.sessionId).toBe('session-1');
      expect(result.lock?.ownerId).toBe('owner-1');
    });

    it('should prevent double acquisition by different owner', async () => {
      await lockManager.acquire('session-1', 'owner-1');
      const result = await lockManager.acquire('session-1', 'owner-2');
      
      expect(result.acquired).toBe(false);
      expect(result.reason).toContain('owner-1');
    });

    it('should refresh lock for same owner', async () => {
      const result1 = await lockManager.acquire('session-1', 'owner-1');
      const time1 = result1.lock!.acquiredAt;

      await new Promise(resolve => setTimeout(resolve, 50));

      const result2 = await lockManager.acquire('session-1', 'owner-1');
      const time2 = result2.lock!.acquiredAt;

      expect(result2.acquired).toBe(true);
      expect(time2).toBeGreaterThan(time1);
    });

    it('should allow acquisition after timeout', async () => {
      await lockManager.acquire('session-1', 'owner-1');
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      const result = await lockManager.acquire('session-1', 'owner-2');
      expect(result.acquired).toBe(true);
      expect(result.lock?.ownerId).toBe('owner-2');
    });
  });

  describe('release', () => {
    it('should release lock', async () => {
      await lockManager.acquire('session-1', 'owner-1');
      const released = await lockManager.release('session-1', 'owner-1');
      
      expect(released).toBe(true);
      expect(lockManager.isLocked('session-1')).toBe(false);
    });

    it('should return false if no lock to release', async () => {
      const released = await lockManager.release('session-1', 'owner-1');
      expect(released).toBe(false);
    });

    it('should throw if releasing lock owned by someone else', async () => {
      await lockManager.acquire('session-1', 'owner-1');
      
      await expect(
        lockManager.release('session-1', 'owner-2')
      ).rejects.toThrow('Cannot release lock');
    });
  });

  describe('isLocked', () => {
    it('should return true for locked session', async () => {
      await lockManager.acquire('session-1', 'owner-1');
      expect(lockManager.isLocked('session-1')).toBe(true);
    });

    it('should return false for unlocked session', () => {
      expect(lockManager.isLocked('session-1')).toBe(false);
    });

    it('should return false after timeout', async () => {
      await lockManager.acquire('session-1', 'owner-1');
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      expect(lockManager.isLocked('session-1')).toBe(false);
    });
  });

  describe('getLock', () => {
    it('should get lock info', async () => {
      await lockManager.acquire('session-1', 'owner-1');
      const lock = lockManager.getLock('session-1');
      
      expect(lock).toBeDefined();
      expect(lock?.ownerId).toBe('owner-1');
    });

    it('should return undefined for non-existent lock', () => {
      const lock = lockManager.getLock('session-1');
      expect(lock).toBeUndefined();
    });

    it('should return undefined for expired lock', async () => {
      await lockManager.acquire('session-1', 'owner-1');
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const lock = lockManager.getLock('session-1');
      expect(lock).toBeUndefined();
    });
  });

  describe('cleanup', () => {
    it('should remove expired locks', async () => {
      await lockManager.acquire('session-1', 'owner-1');
      await lockManager.acquire('session-2', 'owner-2');
      
      await new Promise(resolve => setTimeout(resolve, 1100));

      const cleaned = lockManager.cleanup();
      expect(cleaned).toBe(2);
      expect(lockManager.getAllLocks()).toHaveLength(0);
    });

    it('should keep valid locks', async () => {
      await lockManager.acquire('session-1', 'owner-1');
      
      const cleaned = lockManager.cleanup();
      expect(cleaned).toBe(0);
      expect(lockManager.getAllLocks()).toHaveLength(1);
    });
  });

  describe('forceRelease', () => {
    it('should force release any lock', async () => {
      await lockManager.acquire('session-1', 'owner-1');
      const released = await lockManager.forceRelease('session-1');
      
      expect(released).toBe(true);
      expect(lockManager.isLocked('session-1')).toBe(false);
    });
  });

  describe('getAllLocks', () => {
    it('should return all active locks', async () => {
      await lockManager.acquire('session-1', 'owner-1');
      await lockManager.acquire('session-2', 'owner-2');
      
      const locks = lockManager.getAllLocks();
      expect(locks).toHaveLength(2);
    });

    it('should exclude expired locks', async () => {
      await lockManager.acquire('session-1', 'owner-1');
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const locks = lockManager.getAllLocks();
      expect(locks).toHaveLength(0);
    });
  });

  describe('clearAll', () => {
    it('should clear all locks', async () => {
      await lockManager.acquire('session-1', 'owner-1');
      await lockManager.acquire('session-2', 'owner-2');
      
      lockManager.clearAll();
      
      expect(lockManager.getAllLocks()).toHaveLength(0);
    });
  });
});

describe('withLock helper', () => {
  let fs: InMemoryFileSystem;
  let lockManager: LockManager;

  beforeEach(() => {
    fs = new InMemoryFileSystem();
    lockManager = new LockManager(fs, {
      lockTimeoutMs: 1000,
      checkIntervalMs: 100
    });
  });

  it('should execute function with lock', async () => {
    let executed = false;
    
    await withLock(lockManager, 'session-1', 'owner-1', async () => {
      executed = true;
      expect(lockManager.isLocked('session-1')).toBe(true);
    });

    expect(executed).toBe(true);
    expect(lockManager.isLocked('session-1')).toBe(false);
  });

  it('should release lock even on error', async () => {
    await expect(
      withLock(lockManager, 'session-1', 'owner-1', async () => {
        throw new Error('Test error');
      })
    ).rejects.toThrow('Test error');

    expect(lockManager.isLocked('session-1')).toBe(false);
  });

  it('should throw if cannot acquire lock', async () => {
    await lockManager.acquire('session-1', 'owner-1');

    await expect(
      withLock(lockManager, 'session-1', 'owner-2', async () => {
        // Should not execute
      })
    ).rejects.toThrow('Cannot acquire lock');
  });

  it('should return function result', async () => {
    const result = await withLock(lockManager, 'session-1', 'owner-1', async () => {
      return 'success';
    });

    expect(result).toBe('success');
  });
});
