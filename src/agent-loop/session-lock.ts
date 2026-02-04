/**
 * Session Lock Manager
 * 
 * Ensures only one run per session at a time.
 */

import type { SessionLock } from './types';

// ============================================================================
// Lock Manager
// ============================================================================

export class SessionLockManager {
  private locks: Map<string, string> = new Map(); // sessionId -> runId
  private waiters: Map<string, Array<{ runId: string; resolve: () => void; reject: (err: Error) => void }>> = new Map();
  
  /**
   * Acquire lock for session
   */
  async acquire(
    sessionId: string,
    runId: string,
    timeout: number = 30000
  ): Promise<SessionLock> {
    // If not locked, acquire immediately
    if (!this.isLocked(sessionId)) {
      this.locks.set(sessionId, runId);
      return this.createLock(sessionId, runId);
    }
    
    // Wait for lock
    return new Promise((resolve, reject) => {
      const waiter = { runId, resolve: () => {}, reject };
      
      // Setup timeout
      const timeoutId = setTimeout(() => {
        this.removeWaiter(sessionId, runId);
        reject(new Error(`Lock acquisition timeout for session ${sessionId}`));
      }, timeout);
      
      waiter.resolve = () => {
        clearTimeout(timeoutId);
        this.locks.set(sessionId, runId);
        resolve(this.createLock(sessionId, runId));
      };
      
      // Add to waiters
      if (!this.waiters.has(sessionId)) {
        this.waiters.set(sessionId, []);
      }
      this.waiters.get(sessionId)!.push(waiter);
    });
  }
  
  /**
   * Release lock
   */
  release(sessionId: string, runId: string): void {
    const holder = this.locks.get(sessionId);
    
    if (holder !== runId) {
      return; // Not the holder
    }
    
    this.locks.delete(sessionId);
    
    // Give lock to next waiter
    const waiters = this.waiters.get(sessionId);
    if (waiters && waiters.length > 0) {
      const next = waiters.shift()!;
      next.resolve();
      
      if (waiters.length === 0) {
        this.waiters.delete(sessionId);
      }
    }
  }
  
  /**
   * Check if session is locked
   */
  isLocked(sessionId: string): boolean {
    return this.locks.has(sessionId);
  }
  
  /**
   * Get lock holder
   */
  getHolder(sessionId: string): string | null {
    return this.locks.get(sessionId) ?? null;
  }
  
  /**
   * Get waiting runs
   */
  getWaiters(sessionId: string): string[] {
    const waiters = this.waiters.get(sessionId) ?? [];
    return waiters.map(w => w.runId);
  }
  
  /**
   * Force release lock
   */
  forceRelease(sessionId: string): void {
    const holder = this.locks.get(sessionId);
    if (holder) {
      this.release(sessionId, holder);
    }
  }
  
  private createLock(sessionId: string, runId: string): SessionLock {
    return {
      sessionId,
      runId,
      acquiredAt: Date.now(),
      release: () => this.release(sessionId, runId),
    };
  }
  
  private removeWaiter(sessionId: string, runId: string): void {
    const waiters = this.waiters.get(sessionId);
    if (waiters) {
      const index = waiters.findIndex(w => w.runId === runId);
      if (index !== -1) {
        waiters.splice(index, 1);
      }
      if (waiters.length === 0) {
        this.waiters.delete(sessionId);
      }
    }
  }
}
