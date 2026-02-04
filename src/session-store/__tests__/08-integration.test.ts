/**
 * Integration tests combining SessionStore with locking
 */

import { SessionStore } from '../SessionStore';
import { InMemoryFileSystem } from '../FileSystem';

describe('SessionStore - Integration', () => {
  let fs: InMemoryFileSystem;
  let store: SessionStore;

  beforeEach(async () => {
    fs = new InMemoryFileSystem();
    store = new SessionStore(fs, {
      storageDir: '/sessions',
      indexSaveDelayMs: 0,
      lockTimeoutMs: 1000
    });
    await store.init();
  });

  describe('locking integration', () => {
    it('should acquire and release lock', async () => {
      const sessionId = await store.resolve('user:alice');
      
      const result = await store.acquireLock(sessionId, 'worker-1');
      expect(result.acquired).toBe(true);
      
      expect(store.isLocked(sessionId)).toBe(true);
      
      await store.releaseLock(sessionId, 'worker-1');
      expect(store.isLocked(sessionId)).toBe(false);
    });

    it('should use withLock helper', async () => {
      const sessionId = await store.resolve('user:alice');
      let executed = false;

      await store.withLock(sessionId, 'worker-1', async () => {
        executed = true;
        expect(store.isLocked(sessionId)).toBe(true);
        
        await store.append(sessionId, {
          type: 'user',
          role: 'user',
          content: 'Locked operation',
          parentId: null
        });
      });

      expect(executed).toBe(true);
      expect(store.isLocked(sessionId)).toBe(false);
      
      const messages = await store.getMessages(sessionId);
      expect(messages).toHaveLength(1);
    });

    it('should get lock info', async () => {
      const sessionId = await store.resolve('user:alice');
      await store.acquireLock(sessionId, 'worker-1');
      
      const lock = store.getLock(sessionId);
      expect(lock).toBeDefined();
      expect(lock?.ownerId).toBe('worker-1');
      expect(lock?.sessionId).toBe(sessionId);
    });
  });

  describe('concurrent access simulation', () => {
    it('should prevent concurrent writes to same session', async () => {
      const sessionId = await store.resolve('user:alice');

      // Worker 1 acquires lock
      const result1 = await store.acquireLock(sessionId, 'worker-1');
      expect(result1.acquired).toBe(true);

      // Worker 2 tries to acquire
      const result2 = await store.acquireLock(sessionId, 'worker-2');
      expect(result2.acquired).toBe(false);

      // Worker 1 releases
      await store.releaseLock(sessionId, 'worker-1');

      // Worker 2 can now acquire
      const result3 = await store.acquireLock(sessionId, 'worker-2');
      expect(result3.acquired).toBe(true);
    });

    it('should allow concurrent operations on different sessions', async () => {
      const session1 = await store.resolve('user:alice');
      const session2 = await store.resolve('user:bob');

      const result1 = await store.acquireLock(session1, 'worker-1');
      const result2 = await store.acquireLock(session2, 'worker-2');

      expect(result1.acquired).toBe(true);
      expect(result2.acquired).toBe(true);
    });
  });

  describe('persistence', () => {
    it('should persist and reload session data', async () => {
      const sessionId = await store.resolve('user:alice');
      
      await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Hello',
        parentId: null
      });

      await store.append(sessionId, {
        type: 'assistant',
        role: 'assistant',
        content: 'Hi there',
        parentId: null
      });

      await store.flush();

      // Create new store instance
      const store2 = new SessionStore(fs, {
        storageDir: '/sessions'
      });
      await store2.init();

      expect(store2.hasKey('user:alice')).toBe(true);
      
      const messages = await store2.getMessages(sessionId);
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Hello');
      expect(messages[1].content).toBe('Hi there');
    });

    it('should persist branches', async () => {
      const sessionId = await store.resolve('user:alice');
      
      const msg = await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Root',
        parentId: null
      });

      await store.createBranch(sessionId, 'main', msg.id);
      await store.flush();

      // Reload
      const store2 = new SessionStore(fs, {
        storageDir: '/sessions'
      });
      await store2.init();

      const branches = await store2.getBranches(sessionId);
      expect(branches).toHaveLength(1);
      expect(branches[0].name).toBe('main');
    });
  });

  describe('complex scenarios', () => {
    it('should handle branching conversation tree', async () => {
      const sessionId = await store.resolve('user:alice');

      // Create conversation tree
      const root = await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Hello',
        parentId: null
      });

      const response1 = await store.append(sessionId, {
        type: 'assistant',
        role: 'assistant',
        content: 'Response A',
        parentId: root.id
      });

      const response2 = await store.append(sessionId, {
        type: 'assistant',
        role: 'assistant',
        content: 'Response B',
        parentId: root.id
      });

      // Create branches
      await store.createBranch(sessionId, 'branch-a', response1.id);
      await store.createBranch(sessionId, 'branch-b', response2.id);

      // Continue branch A
      await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Continue A',
        parentId: response1.id
      });

      // Verify tree structure
      const children = await store.getChildren(sessionId, root.id);
      expect(children).toHaveLength(2);

      const history1 = await store.getLinearHistory(sessionId, response1.id);
      expect(history1).toHaveLength(2);
      expect(history1[0].content).toBe('Hello');
      expect(history1[1].content).toBe('Response A');

      const branches = await store.getBranches(sessionId);
      expect(branches).toHaveLength(2);
    });

    it('should handle session with multiple root messages', async () => {
      const sessionId = await store.resolve('user:alice');

      await store.append(sessionId, {
        type: 'system',
        role: 'system',
        content: 'System message',
        parentId: null
      });

      await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'User message',
        parentId: null
      });

      const roots = await store.getChildren(sessionId, null);
      expect(roots).toHaveLength(2);
    });
  });
});
