/**
 * Tests for SessionStore basic operations
 */

import { SessionStore } from '../SessionStore';
import { InMemoryFileSystem } from '../FileSystem';
import type { Message } from '../types';

describe('SessionStore - Basic Operations', () => {
  let fs: InMemoryFileSystem;
  let store: SessionStore;

  beforeEach(async () => {
    fs = new InMemoryFileSystem();
    store = new SessionStore(fs, {
      storageDir: '/sessions',
      indexSaveDelayMs: 0
    });
    await store.init();
  });

  describe('resolve', () => {
    it('should create new session for new key', async () => {
      const sessionId = await store.resolve('user:alice');
      
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      expect(store.hasSession(sessionId)).toBe(true);
      expect(store.hasKey('user:alice')).toBe(true);
    });

    it('should return existing session for existing key', async () => {
      const sessionId1 = await store.resolve('user:alice');
      const sessionId2 = await store.resolve('user:alice');
      
      expect(sessionId1).toBe(sessionId2);
    });

    it('should create different sessions for different keys', async () => {
      const sessionId1 = await store.resolve('user:alice');
      const sessionId2 = await store.resolve('user:bob');
      
      expect(sessionId1).not.toBe(sessionId2);
    });
  });

  describe('append', () => {
    it('should append message to session', async () => {
      const sessionId = await store.resolve('user:alice');
      
      const message = await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Hello',
        parentId: null
      });

      expect(message.id).toBeDefined();
      expect(message.timestamp).toBeDefined();
      expect(message.content).toBe('Hello');
    });

    it('should update message count in metadata', async () => {
      const sessionId = await store.resolve('user:alice');
      
      await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Message 1',
        parentId: null
      });

      await store.append(sessionId, {
        type: 'assistant',
        role: 'assistant',
        content: 'Message 2',
        parentId: null
      });

      const metadata = store.getMetadata(sessionId);
      expect(metadata?.messageCount).toBe(2);
    });

    it('should persist messages to disk', async () => {
      const sessionId = await store.resolve('user:alice');
      
      await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Hello',
        parentId: null
      });

      const messages = await store.getMessages(sessionId);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Hello');
    });
  });

  describe('getMessages', () => {
    it('should return empty array for new session', async () => {
      const sessionId = await store.resolve('user:alice');
      const messages = await store.getMessages(sessionId);
      expect(messages).toEqual([]);
    });

    it('should return all messages in order', async () => {
      const sessionId = await store.resolve('user:alice');
      
      await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'First',
        parentId: null
      });

      await store.append(sessionId, {
        type: 'assistant',
        role: 'assistant',
        content: 'Second',
        parentId: null
      });

      const messages = await store.getMessages(sessionId);
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('First');
      expect(messages[1].content).toBe('Second');
    });
  });

  describe('metadata', () => {
    it('should get metadata by session ID', async () => {
      const sessionId = await store.resolve('user:alice');
      const metadata = store.getMetadata(sessionId);
      
      expect(metadata).toBeDefined();
      expect(metadata?.sessionId).toBe(sessionId);
      expect(metadata?.messageCount).toBe(0);
    });

    it('should get metadata by key', async () => {
      await store.resolve('user:alice');
      const metadata = store.getMetadataByKey('user:alice');
      
      expect(metadata).toBeDefined();
      expect(metadata?.messageCount).toBe(0);
    });

    it('should return undefined for non-existent session', () => {
      const metadata = store.getMetadata('missing');
      expect(metadata).toBeUndefined();
    });
  });

  describe('deleteSession', () => {
    it('should delete session and its data', async () => {
      const sessionId = await store.resolve('user:alice');
      await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Hello',
        parentId: null
      });

      await store.deleteSession(sessionId);

      expect(store.hasSession(sessionId)).toBe(false);
      expect(store.hasKey('user:alice')).toBe(false);
    });
  });

  describe('listing', () => {
    it('should list all session IDs', async () => {
      const id1 = await store.resolve('user:alice');
      const id2 = await store.resolve('user:bob');

      const ids = store.getAllSessionIds();
      expect(ids).toHaveLength(2);
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
    });

    it('should list all keys', async () => {
      await store.resolve('user:alice');
      await store.resolve('user:bob');

      const keys = store.getAllKeys();
      expect(keys).toHaveLength(2);
      expect(keys).toContain('user:alice');
      expect(keys).toContain('user:bob');
    });

    it('should get session ID by key without creating', async () => {
      expect(store.getSessionId('missing:key')).toBeUndefined();

      const id = await store.resolve('user:alice');
      expect(store.getSessionId('user:alice')).toBe(id);
    });

    it('should get all keys for a session', async () => {
      const sessionId = await store.resolve('user:alice');

      const keys = store.getSessionKeys(sessionId);
      expect(keys).toEqual(['user:alice']);
    });
  });

  describe('flush', () => {
    it('should force save index', async () => {
      const store2 = new SessionStore(fs, {
        storageDir: '/sessions2',
        indexSaveDelayMs: 1000 // Long delay
      });
      await store2.init();

      await store2.resolve('user:alice');
      await store2.flush();

      // Load new store from same directory
      const store3 = new SessionStore(fs, {
        storageDir: '/sessions2'
      });
      await store3.init();

      expect(store3.hasKey('user:alice')).toBe(true);
    });
  });
});
