/**
 * Tests for SessionIndex
 */

import { SessionIndexManager } from '../SessionIndex';
import { InMemoryFileSystem } from '../FileSystem';
import type { SessionMetadata } from '../types';

describe('SessionIndexManager', () => {
  let fs: InMemoryFileSystem;
  let index: SessionIndexManager;

  beforeEach(async () => {
    fs = new InMemoryFileSystem();
    index = new SessionIndexManager(fs, {
      indexPath: '/sessions.json',
      saveDelayMs: 0 // Immediate save for testing
    });
    await index.load();
  });

  describe('registration', () => {
    it('should register new session', async () => {
      const metadata: SessionMetadata = {
        sessionId: 'session-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0
      };

      await index.registerSession('session-1', 'user:alice', metadata);

      expect(index.hasKey('user:alice')).toBe(true);
      expect(index.hasSession('session-1')).toBe(true);
      expect(index.getSessionId('user:alice')).toBe('session-1');
    });

    it('should persist to disk', async () => {
      const metadata: SessionMetadata = {
        sessionId: 'session-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0
      };

      await index.registerSession('session-1', 'user:alice', metadata);
      await index.saveNow();

      // Load new index from same file
      const index2 = new SessionIndexManager(fs, {
        indexPath: '/sessions.json'
      });
      await index2.load();

      expect(index2.hasKey('user:alice')).toBe(true);
      expect(index2.getSessionId('user:alice')).toBe('session-1');
    });
  });

  describe('metadata operations', () => {
    beforeEach(async () => {
      const metadata: SessionMetadata = {
        sessionId: 'session-1',
        createdAt: 1000,
        updatedAt: 1000,
        messageCount: 0
      };
      await index.registerSession('session-1', 'user:alice', metadata);
    });

    it('should get metadata by session ID', () => {
      const metadata = index.getMetadata('session-1');
      expect(metadata).toBeDefined();
      expect(metadata?.sessionId).toBe('session-1');
      expect(metadata?.messageCount).toBe(0);
    });

    it('should get metadata by key', () => {
      const metadata = index.getMetadataByKey('user:alice');
      expect(metadata).toBeDefined();
      expect(metadata?.sessionId).toBe('session-1');
    });

    it('should update metadata', async () => {
      await index.updateMetadata('session-1', {
        messageCount: 5,
        updatedAt: 2000
      });

      const metadata = index.getMetadata('session-1');
      expect(metadata?.messageCount).toBe(5);
      expect(metadata?.updatedAt).toBe(2000);
      expect(metadata?.createdAt).toBe(1000); // Unchanged
    });

    it('should throw on updating non-existent session', async () => {
      await expect(
        index.updateMetadata('missing', { messageCount: 1 })
      ).rejects.toThrow('not found');
    });
  });

  describe('key operations', () => {
    beforeEach(async () => {
      const metadata: SessionMetadata = {
        sessionId: 'session-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0
      };
      await index.registerSession('session-1', 'user:alice', metadata);
    });

    it('should add additional key to session', async () => {
      await index.addKey('user:alice2', 'session-1');
      
      expect(index.getSessionId('user:alice')).toBe('session-1');
      expect(index.getSessionId('user:alice2')).toBe('session-1');
    });

    it('should get all keys for session', async () => {
      await index.addKey('user:alice2', 'session-1');
      await index.addKey('user:alice3', 'session-1');

      const keys = index.getSessionKeys('session-1');
      expect(keys).toHaveLength(3);
      expect(keys).toContain('user:alice');
      expect(keys).toContain('user:alice2');
      expect(keys).toContain('user:alice3');
    });

    it('should remove key', async () => {
      await index.removeKey('user:alice');
      expect(index.hasKey('user:alice')).toBe(false);
      expect(index.hasSession('session-1')).toBe(true); // Session still exists
    });
  });

  describe('deletion', () => {
    beforeEach(async () => {
      const metadata: SessionMetadata = {
        sessionId: 'session-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0
      };
      await index.registerSession('session-1', 'user:alice', metadata);
      await index.addKey('user:alice2', 'session-1');
    });

    it('should delete session and all its keys', async () => {
      await index.deleteSession('session-1');

      expect(index.hasSession('session-1')).toBe(false);
      expect(index.hasKey('user:alice')).toBe(false);
      expect(index.hasKey('user:alice2')).toBe(false);
    });

    it('should delete session by key', async () => {
      await index.deleteSessionByKey('user:alice');

      expect(index.hasSession('session-1')).toBe(false);
      expect(index.hasKey('user:alice')).toBe(false);
      expect(index.hasKey('user:alice2')).toBe(false);
    });

    it('should throw on deleting non-existent key', async () => {
      await expect(
        index.deleteSessionByKey('missing')
      ).rejects.toThrow('not found');
    });
  });

  describe('listing', () => {
    beforeEach(async () => {
      await index.registerSession('session-1', 'user:alice', {
        sessionId: 'session-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0
      });
      await index.registerSession('session-2', 'user:bob', {
        sessionId: 'session-2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0
      });
    });

    it('should get all session IDs', () => {
      const ids = index.getAllSessionIds();
      expect(ids).toHaveLength(2);
      expect(ids).toContain('session-1');
      expect(ids).toContain('session-2');
    });

    it('should get all keys', () => {
      const keys = index.getAllKeys();
      expect(keys).toHaveLength(2);
      expect(keys).toContain('user:alice');
      expect(keys).toContain('user:bob');
    });
  });

  describe('clear', () => {
    it('should clear all data', async () => {
      await index.registerSession('session-1', 'user:alice', {
        sessionId: 'session-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0
      });

      await index.clear();

      expect(index.getAllSessionIds()).toHaveLength(0);
      expect(index.getAllKeys()).toHaveLength(0);
    });
  });

  describe('save debouncing', () => {
    it('should debounce saves', async () => {
      const index2 = new SessionIndexManager(fs, {
        indexPath: '/sessions2.json',
        saveDelayMs: 50
      });
      await index2.load();

      const metadata: SessionMetadata = {
        sessionId: 'session-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0
      };

      await index2.registerSession('session-1', 'user:alice', metadata);

      // File should not exist immediately
      expect(await fs.exists('/sessions2.json')).toBe(false);

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 100));

      // Now should be saved
      expect(await fs.exists('/sessions2.json')).toBe(true);
    });
  });
});
