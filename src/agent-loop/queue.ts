/**
 * Queue Manager
 * 
 * Manages global run queue with concurrency limits.
 */

import type { QueueStatus } from './types';

// ============================================================================
// Queue Item
// ============================================================================

interface QueueItem {
  runId: string;
  sessionId: string;
  priority: number;
  enqueuedAt: number;
  startedAt?: number;
}

// ============================================================================
// Queue Manager
// ============================================================================

export class QueueManager {
  private queue: QueueItem[] = [];
  private running: Set<string> = new Set();
  private maxConcurrent: number;
  
  constructor(maxConcurrent: number = 10) {
    this.maxConcurrent = maxConcurrent;
  }
  
  /**
   * Enqueue run
   */
  enqueue(runId: string, sessionId: string, priority: number = 0): void {
    this.queue.push({
      runId,
      sessionId,
      priority,
      enqueuedAt: Date.now(),
    });
    
    // Sort by priority (higher first), then by enqueuedAt
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.enqueuedAt - b.enqueuedAt;
    });
  }
  
  /**
   * Dequeue next run (if capacity available)
   */
  dequeue(): QueueItem | null {
    if (this.running.size >= this.maxConcurrent) {
      return null;
    }
    
    const item = this.queue.shift();
    if (item) {
      item.startedAt = Date.now();
      this.running.add(item.runId);
    }
    
    return item ?? null;
  }
  
  /**
   * Mark run as complete
   */
  complete(runId: string): void {
    this.running.delete(runId);
  }
  
  /**
   * Remove run from queue
   */
  remove(runId: string): boolean {
    const index = this.queue.findIndex(item => item.runId === runId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }
  
  /**
   * Get queue status
   */
  getStatus(): QueueStatus {
    return {
      queued: this.queue.length,
      running: this.running.size,
      capacity: this.maxConcurrent - this.running.size,
    };
  }
  
  /**
   * Get position in queue
   */
  getPosition(runId: string): number | null {
    const index = this.queue.findIndex(item => item.runId === runId);
    return index !== -1 ? index + 1 : null;
  }
  
  /**
   * Check if run is running
   */
  isRunning(runId: string): boolean {
    return this.running.has(runId);
  }
  
  /**
   * Check if run is queued
   */
  isQueued(runId: string): boolean {
    return this.queue.some(item => item.runId === runId);
  }
  
  /**
   * Get all runs for session
   */
  getSessionRuns(sessionId: string): { queued: string[]; running: string[] } {
    const queued = this.queue
      .filter(item => item.sessionId === sessionId)
      .map(item => item.runId);
    
    const running: string[] = [];
    for (const item of this.queue) {
      if (item.sessionId === sessionId && this.running.has(item.runId)) {
        running.push(item.runId);
      }
    }
    
    return { queued, running };
  }
  
  /**
   * Clear all queued and running
   */
  clear(): void {
    this.queue = [];
    this.running.clear();
  }
}
