/**
 * Queue Manager Tests
 */

import { QueueManager } from '../queue';

describe('QueueManager', () => {
  let queue: QueueManager;
  
  beforeEach(() => {
    queue = new QueueManager(3); // Max 3 concurrent
  });
  
  describe('Enqueueing', () => {
    it('should enqueue runs', () => {
      queue.enqueue('run-1', 'session-1', 0);
      
      const status = queue.getStatus();
      expect(status.queued).toBe(1);
      expect(status.running).toBe(0);
    });
    
    it('should sort by priority', () => {
      queue.enqueue('run-1', 'session-1', 0);
      queue.enqueue('run-2', 'session-2', 10);
      queue.enqueue('run-3', 'session-3', 5);
      
      const item1 = queue.dequeue();
      expect(item1?.runId).toBe('run-2'); // Highest priority
    });
  });
  
  describe('Dequeueing', () => {
    it('should dequeue if capacity available', () => {
      queue.enqueue('run-1', 'session-1', 0);
      
      const item = queue.dequeue();
      
      expect(item).not.toBeNull();
      expect(item?.runId).toBe('run-1');
      expect(queue.isRunning('run-1')).toBe(true);
    });
    
    it('should return null if at capacity', () => {
      queue.enqueue('run-1', 'session-1', 0);
      queue.enqueue('run-2', 'session-2', 0);
      queue.enqueue('run-3', 'session-3', 0);
      queue.enqueue('run-4', 'session-4', 0);
      
      queue.dequeue(); // 1 running
      queue.dequeue(); // 2 running
      queue.dequeue(); // 3 running (max)
      
      const item = queue.dequeue();
      expect(item).toBeNull();
      
      const status = queue.getStatus();
      expect(status.running).toBe(3);
      expect(status.capacity).toBe(0);
    });
  });
  
  describe('Completion', () => {
    it('should mark run as complete', () => {
      queue.enqueue('run-1', 'session-1', 0);
      queue.dequeue();
      
      queue.complete('run-1');
      
      expect(queue.isRunning('run-1')).toBe(false);
      
      const status = queue.getStatus();
      expect(status.running).toBe(0);
    });
  });
  
  describe('Removal', () => {
    it('should remove queued run', () => {
      queue.enqueue('run-1', 'session-1', 0);
      
      const removed = queue.remove('run-1');
      
      expect(removed).toBe(true);
      expect(queue.isQueued('run-1')).toBe(false);
    });
    
    it('should return false if not found', () => {
      const removed = queue.remove('nonexistent');
      expect(removed).toBe(false);
    });
  });
  
  describe('Session Runs', () => {
    it('should get runs for session', () => {
      queue.enqueue('run-1', 'session-1', 0);
      queue.enqueue('run-2', 'session-1', 0);
      queue.enqueue('run-3', 'session-2', 0);
      
      const runs = queue.getSessionRuns('session-1');
      
      expect(runs.queued).toContain('run-1');
      expect(runs.queued).toContain('run-2');
      expect(runs.queued).not.toContain('run-3');
    });
  });
});
