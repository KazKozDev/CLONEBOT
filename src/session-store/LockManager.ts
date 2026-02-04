/**
 * Lock Manager for session-level locking
 */

import type { FileSystem } from './FileSystem';
import type { Lock } from './types';

/**
 * LockManager configuration
 */
export interface LockManagerConfig {
  /** Lock timeout in ms */
  lockTimeoutMs: number;
  /** Lock check interval in ms */
  checkIntervalMs: number;
}

/**
 * Lock acquisition result
 */
export interface LockResult {
  acquired: boolean;
  lock?: Lock;
  reason?: string;
}

/**
 * LockManager class
 */
export class LockManager {
  private locks = new Map<string, Lock>();

  constructor(
    private fs: FileSystem,
    private config: LockManagerConfig
  ) {}

  /**
   * Try to acquire lock for session
   */
  async acquire(sessionId: string, ownerId: string): Promise<LockResult> {
    // Check existing lock
    const existing = this.locks.get(sessionId);
    if (existing) {
      // Check if lock expired
      const now = Date.now();
      if (now - existing.acquiredAt < this.config.lockTimeoutMs) {
        if (existing.ownerId === ownerId) {
          // Already own the lock - refresh it
          existing.acquiredAt = now;
          return { acquired: true, lock: existing };
        } else {
          return {
            acquired: false,
            reason: `Locked by ${existing.ownerId}`
          };
        }
      }
      // Lock expired - can acquire
    }

    // Create new lock
    const lock: Lock = {
      sessionId,
      ownerId,
      acquiredAt: Date.now()
    };

    this.locks.set(sessionId, lock);

    return { acquired: true, lock };
  }

  /**
   * Release lock
   */
  async release(sessionId: string, ownerId: string): Promise<boolean> {
    const existing = this.locks.get(sessionId);
    if (!existing) {
      return false; // No lock to release
    }

    if (existing.ownerId !== ownerId) {
      throw new Error(`Cannot release lock owned by ${existing.ownerId}`);
    }

    this.locks.delete(sessionId);
    return true;
  }

  /**
   * Check if session is locked
   */
  isLocked(sessionId: string): boolean {
    const lock = this.locks.get(sessionId);
    if (!lock) return false;

    // Check if expired
    const now = Date.now();
    if (now - lock.acquiredAt >= this.config.lockTimeoutMs) {
      this.locks.delete(sessionId);
      return false;
    }

    return true;
  }

  /**
   * Get lock for session
   */
  getLock(sessionId: string): Lock | undefined {
    const lock = this.locks.get(sessionId);
    if (!lock) return undefined;

    // Check if expired
    const now = Date.now();
    if (now - lock.acquiredAt >= this.config.lockTimeoutMs) {
      this.locks.delete(sessionId);
      return undefined;
    }

    return lock;
  }

  /**
   * Force release lock (admin)
   */
  async forceRelease(sessionId: string): Promise<boolean> {
    return this.locks.delete(sessionId);
  }

  /**
   * Clean up expired locks
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, lock] of this.locks.entries()) {
      if (now - lock.acquiredAt >= this.config.lockTimeoutMs) {
        this.locks.delete(sessionId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get all active locks
   */
  getAllLocks(): Lock[] {
    this.cleanup(); // Clean up first
    return Array.from(this.locks.values());
  }

  /**
   * Clear all locks
   */
  clearAll(): void {
    this.locks.clear();
  }
}

/**
 * Helper for with-lock pattern
 */
export async function withLock<T>(
  lockManager: LockManager,
  sessionId: string,
  ownerId: string,
  fn: () => Promise<T>
): Promise<T> {
  const result = await lockManager.acquire(sessionId, ownerId);
  
  if (!result.acquired) {
    throw new Error(`Cannot acquire lock: ${result.reason}`);
  }

  try {
    return await fn();
  } finally {
    await lockManager.release(sessionId, ownerId);
  }
}
