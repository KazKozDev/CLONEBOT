/**
 * Tests for tree structure and branching
 */

import { SessionStore } from '../SessionStore';
import { InMemoryFileSystem } from '../FileSystem';

describe('SessionStore - Tree Structure', () => {
  let fs: InMemoryFileSystem;
  let store: SessionStore;
  let sessionId: string;

  beforeEach(async () => {
    fs = new InMemoryFileSystem();
    store = new SessionStore(fs, {
      storageDir: '/sessions',
      indexSaveDelayMs: 0
    });
    await store.init();
    sessionId = await store.resolve('user:alice');
  });

  describe('linear history', () => {
    it('should build linear history from leaf to root', async () => {
      const msg1 = await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'First',
        parentId: null
      });

      const msg2 = await store.append(sessionId, {
        type: 'assistant',
        role: 'assistant',
        content: 'Second',
        parentId: msg1.id
      });

      const msg3 = await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Third',
        parentId: msg2.id
      });

      const history = await store.getLinearHistory(sessionId, msg3.id);
      
      expect(history).toHaveLength(3);
      expect(history[0].content).toBe('First');
      expect(history[1].content).toBe('Second');
      expect(history[2].content).toBe('Third');
    });

    it('should handle single message', async () => {
      const msg = await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Only',
        parentId: null
      });

      const history = await store.getLinearHistory(sessionId, msg.id);
      
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Only');
    });
  });

  describe('branching', () => {
    it('should create branch from leaf message', async () => {
      const msg1 = await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Root',
        parentId: null
      });

      const msg2 = await store.append(sessionId, {
        type: 'assistant',
        role: 'assistant',
        content: 'Branch A',
        parentId: msg1.id
      });

      const branch = await store.createBranch(sessionId, 'main', msg2.id);
      
      expect(branch.name).toBe('main');
      expect(branch.leafMessageId).toBe(msg2.id);
      expect(branch.path).toEqual([msg1.id, msg2.id]);
    });

    it('should get all branches', async () => {
      const msg1 = await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Root',
        parentId: null
      });

      await store.createBranch(sessionId, 'branch1', msg1.id);
      await store.createBranch(sessionId, 'branch2', msg1.id);

      const branches = await store.getBranches(sessionId);
      
      expect(branches).toHaveLength(2);
      expect(branches[0].name).toBe('branch1');
      expect(branches[1].name).toBe('branch2');
    });

    it('should get branch by name', async () => {
      const msg = await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Root',
        parentId: null
      });

      await store.createBranch(sessionId, 'main', msg.id);
      
      const branch = await store.getBranch(sessionId, 'main');
      expect(branch).toBeDefined();
      expect(branch?.name).toBe('main');
    });

    it('should switch to branch', async () => {
      const msg = await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Root',
        parentId: null
      });

      await store.createBranch(sessionId, 'main', msg.id);
      
      const leafId = await store.switchToBranch(sessionId, 'main');
      expect(leafId).toBe(msg.id);
    });

    it('should throw on switching to non-existent branch', async () => {
      await expect(
        store.switchToBranch(sessionId, 'missing')
      ).rejects.toThrow('not found');
    });
  });

  describe('children operations', () => {
    it('should get children of message', async () => {
      const msg1 = await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Parent',
        parentId: null
      });

      await store.append(sessionId, {
        type: 'assistant',
        role: 'assistant',
        content: 'Child 1',
        parentId: msg1.id
      });

      await store.append(sessionId, {
        type: 'assistant',
        role: 'assistant',
        content: 'Child 2',
        parentId: msg1.id
      });

      const children = await store.getChildren(sessionId, msg1.id);
      
      expect(children).toHaveLength(2);
      expect(children[0].content).toBe('Child 1');
      expect(children[1].content).toBe('Child 2');
    });

    it('should get root messages (parentId = null)', async () => {
      await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Root 1',
        parentId: null
      });

      await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Root 2',
        parentId: null
      });

      const roots = await store.getChildren(sessionId, null);
      
      expect(roots).toHaveLength(2);
    });

    it('should check if message has children', async () => {
      const msg1 = await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Parent',
        parentId: null
      });

      const msg2 = await store.append(sessionId, {
        type: 'assistant',
        role: 'assistant',
        content: 'Child',
        parentId: msg1.id
      });

      expect(await store.hasChildren(sessionId, msg1.id)).toBe(true);
      expect(await store.hasChildren(sessionId, msg2.id)).toBe(false);
    });
  });

  describe('tree traversal', () => {
    it('should get full tree from root', async () => {
      const msg1 = await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Root',
        parentId: null
      });

      const msg2 = await store.append(sessionId, {
        type: 'assistant',
        role: 'assistant',
        content: 'Child 1',
        parentId: msg1.id
      });

      await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Child 2',
        parentId: msg1.id
      });

      const msg4 = await store.append(sessionId, {
        type: 'assistant',
        role: 'assistant',
        content: 'Grandchild',
        parentId: msg2.id
      });

      const tree = await store.getTree(sessionId, msg1.id);
      
      expect(tree).toHaveLength(3);
      expect(tree.map(m => m.content)).toContain('Child 1');
      expect(tree.map(m => m.content)).toContain('Child 2');
      expect(tree.map(m => m.content)).toContain('Grandchild');
    });

    it('should get subtree from any node', async () => {
      const msg1 = await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Root',
        parentId: null
      });

      const msg2 = await store.append(sessionId, {
        type: 'assistant',
        role: 'assistant',
        content: 'Child',
        parentId: msg1.id
      });

      await store.append(sessionId, {
        type: 'user',
        role: 'user',
        content: 'Grandchild',
        parentId: msg2.id
      });

      const tree = await store.getTree(sessionId, msg2.id);
      
      expect(tree).toHaveLength(1);
      expect(tree[0].content).toBe('Grandchild');
    });
  });
});
