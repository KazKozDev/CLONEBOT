/**
 * Session Store - Usage Examples
 */

import { SessionStore, InMemoryFileSystem, AutoResetManager } from './index';

// ============================================================================
// Example 1: Basic Session Management
// ============================================================================

async function example1_BasicUsage() {
  const store = new SessionStore(new InMemoryFileSystem());
  await store.init();

  // Create/resolve session
  const sessionId = await store.resolve('user:alice');
  console.log('Session ID:', sessionId);

  // Add messages
  const msg1 = await store.append(sessionId, {
    type: 'user',
    role: 'user',
    content: 'Hello!',
    parentId: null
  });

  const msg2 = await store.append(sessionId, {
    type: 'assistant',
    role: 'assistant',
    content: 'Hi there! How can I help?',
    parentId: msg1.id
  });

  // Get history
  const history = await store.getLinearHistory(sessionId, msg2.id);
  console.log('History:', history.map(m => m.content));

  // Get metadata
  const metadata = store.getMetadata(sessionId);
  console.log('Message count:', metadata?.messageCount);
}

// ============================================================================
// Example 2: Branching Conversations
// ============================================================================

async function example2_Branching() {
  const store = new SessionStore(new InMemoryFileSystem());
  await store.init();

  const sessionId = await store.resolve('user:bob');

  // Initial question
  const question = await store.append(sessionId, {
    type: 'user',
    role: 'user',
    content: 'Explain async/await',
    parentId: null
  });

  // Create multiple answer variants
  const simple = await store.append(sessionId, {
    type: 'assistant',
    role: 'assistant',
    content: 'Async/await makes asynchronous code look synchronous.',
    parentId: question.id
  });
  await store.createBranch(sessionId, 'simple-explanation', simple.id);

  const detailed = await store.append(sessionId, {
    type: 'assistant',
    role: 'assistant',
    content: 'Async/await is syntactic sugar over Promises...',
    parentId: question.id
  });
  await store.createBranch(sessionId, 'detailed-explanation', detailed.id);

  const withExample = await store.append(sessionId, {
    type: 'assistant',
    role: 'assistant',
    content: 'Here\'s an example: async function fetchData() {...}',
    parentId: question.id
  });
  await store.createBranch(sessionId, 'with-example', withExample.id);

  // List all branches
  const branches = await store.getBranches(sessionId);
  console.log('Available branches:', branches.map(b => b.name));

  // Switch to a branch
  const leafId = await store.switchToBranch(sessionId, 'detailed-explanation');
  const history = await store.getLinearHistory(sessionId, leafId);
  console.log('Detailed branch:', history);
}

// ============================================================================
// Example 3: Tree Structure
// ============================================================================

async function example3_TreeStructure() {
  const store = new SessionStore(new InMemoryFileSystem());
  await store.init();

  const sessionId = await store.resolve('user:charlie');

  // Build conversation tree
  const root = await store.append(sessionId, {
    type: 'system',
    role: 'system',
    content: 'You are a helpful assistant',
    parentId: null
  });

  const q1 = await store.append(sessionId, {
    type: 'user',
    role: 'user',
    content: 'What is TypeScript?',
    parentId: root.id
  });

  const a1 = await store.append(sessionId, {
    type: 'assistant',
    role: 'assistant',
    content: 'TypeScript is...',
    parentId: q1.id
  });

  // User asks follow-up questions (branching)
  const q2a = await store.append(sessionId, {
    type: 'user',
    role: 'user',
    content: 'Why should I use it?',
    parentId: a1.id
  });

  const q2b = await store.append(sessionId, {
    type: 'user',
    role: 'user',
    content: 'How do I install it?',
    parentId: a1.id
  });

  // Check tree structure
  const children = await store.getChildren(sessionId, a1.id);
  console.log(`Message ${a1.id} has ${children.length} children`);

  // Get full subtree
  const tree = await store.getTree(sessionId, a1.id);
  console.log('Subtree size:', tree.length);

  // Check if message has children
  const hasKids = await store.hasChildren(sessionId, a1.id);
  console.log('Has children:', hasKids);
}

// ============================================================================
// Example 4: Concurrent Access with Locks
// ============================================================================

async function example4_Locking() {
  const store = new SessionStore(new InMemoryFileSystem(), {
    storageDir: '/sessions',
    lockTimeoutMs: 5000
  });
  await store.init();

  const sessionId = await store.resolve('shared:session');

  // Worker function
  async function worker(workerId: string) {
    console.log(`${workerId}: Attempting to acquire lock...`);
    
    const result = await store.acquireLock(sessionId, workerId);
    
    if (!result.acquired) {
      console.log(`${workerId}: Lock is held by ${result.reason}`);
      return;
    }

    try {
      console.log(`${workerId}: Lock acquired, working...`);
      
      await store.append(sessionId, {
        type: 'system',
        role: 'system',
        content: `Work done by ${workerId}`,
        parentId: null
      });

      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log(`${workerId}: Work completed`);
    } finally {
      await store.releaseLock(sessionId, workerId);
      console.log(`${workerId}: Lock released`);
    }
  }

  // Run multiple workers
  await Promise.all([
    worker('worker-1'),
    worker('worker-2'),
    worker('worker-3')
  ]);

  const messages = await store.getMessages(sessionId);
  console.log(`Total messages: ${messages.length}`);
}

// ============================================================================
// Example 5: Using withLock Helper
// ============================================================================

async function example5_WithLock() {
  const store = new SessionStore(new InMemoryFileSystem());
  await store.init();

  const sessionId = await store.resolve('user:david');

  // Automatic lock management
  await store.withLock(sessionId, 'my-worker', async () => {
    console.log('Inside locked section');
    
    // Do work
    await store.append(sessionId, {
      type: 'user',
      role: 'user',
      content: 'Critical operation',
      parentId: null
    });

    // Lock is automatically released even if error occurs
  });

  console.log('Lock released automatically');
}

// ============================================================================
// Example 6: Auto-Reset
// ============================================================================

async function example6_AutoReset() {
  const resetManager = new AutoResetManager({
    enabled: true,
    maxMessages: 10,
    keepStrategy: 'first',
    keepCount: 2,
    insertResetMarker: true
  });

  // Simulate messages
  const messages = Array.from({ length: 12 }, (_, i) => ({
    id: `msg-${i}`,
    parentId: null,
    type: 'user' as const,
    role: 'user' as const,
    content: `Message ${i}`,
    timestamp: Date.now()
  }));

  const result = resetManager.checkAndReset(messages);
  
  if (result.reset) {
    console.log('Session was reset!');
    console.log('Kept messages:', result.messages.length);
    console.log('Messages:', result.messages.map(m => m.content));
  }
}

// ============================================================================
// Example 7: Auto-Reset with Token Limit
// ============================================================================

async function example7_TokenBasedReset() {
  const resetManager = new AutoResetManager({
    enabled: true,
    maxTokens: 1000,
    tokenCounter: (msg) => {
      // Simple estimation: ~4 chars per token
      const content = typeof msg.content === 'string' ? msg.content : '';
      return Math.ceil(content.length / 4);
    },
    keepStrategy: 'system',
    insertResetMarker: true
  });

  const messages = [
    {
      id: 'sys',
      parentId: null,
      type: 'system' as const,
      role: 'system' as const,
      content: 'You are helpful',
      timestamp: Date.now()
    },
    {
      id: 'msg1',
      parentId: null,
      type: 'user' as const,
      role: 'user' as const,
      content: 'x'.repeat(2000), // ~500 tokens
      timestamp: Date.now()
    },
    {
      id: 'msg2',
      parentId: null,
      type: 'user' as const,
      role: 'user' as const,
      content: 'y'.repeat(2400), // ~600 tokens
      timestamp: Date.now()
    }
  ];

  const result = resetManager.checkAndReset(messages);
  console.log('Reset?', result.reset);
  console.log('Kept:', result.messages.map(m => m.type));
}

// ============================================================================
// Example 8: Persistence
// ============================================================================

async function example8_Persistence() {
  // Create store
  const store1 = new SessionStore(new InMemoryFileSystem());
  await store1.init();

  const sessionId = await store1.resolve('user:persistent');
  
  await store1.append(sessionId, {
    type: 'user',
    role: 'user',
    content: 'Save this!',
    parentId: null
  });

  // Force save
  await store1.flush();

  // Create new store instance (simulating restart)
  const store2 = new SessionStore(new InMemoryFileSystem());
  await store2.init();

  // Note: InMemoryFileSystem doesn't persist across instances
  // Use RealFileSystem for actual persistence
  console.log('Has session?', store2.hasKey('user:persistent'));
}

// ============================================================================
// Example 9: Multiple Session Keys
// ============================================================================

async function example9_MultipleKeys() {
  const store = new SessionStore(new InMemoryFileSystem());
  await store.init();

  // Different keys can point to same or different sessions
  const session1 = await store.resolve('user:alice');
  const session2 = await store.resolve('telegram:alice123');
  const session3 = await store.resolve('slack:alice456');

  console.log('Session IDs:', { session1, session2, session3 });
  
  // List all sessions
  const allSessions = store.getAllSessionIds();
  console.log('Total sessions:', allSessions.length);
  
  // List all keys
  const allKeys = store.getAllKeys();
  console.log('All keys:', allKeys);
}

// ============================================================================
// Example 10: Complex Conversation Flow
// ============================================================================

async function example10_ComplexFlow() {
  const store = new SessionStore(new InMemoryFileSystem());
  await store.init();

  const sessionId = await store.resolve('user:elena');

  // System message
  const system = await store.append(sessionId, {
    type: 'system',
    role: 'system',
    content: 'You are an AI coding assistant',
    parentId: null
  });

  // User asks a question
  const q1 = await store.append(sessionId, {
    type: 'user',
    role: 'user',
    content: 'How do I sort an array in JavaScript?',
    parentId: system.id
  });

  // Assistant provides multiple solutions
  const sol1 = await store.append(sessionId, {
    type: 'assistant',
    role: 'assistant',
    content: 'Use array.sort() method',
    parentId: q1.id
  });
  await store.createBranch(sessionId, 'solution-1-simple', sol1.id);

  const sol2 = await store.append(sessionId, {
    type: 'assistant',
    role: 'assistant',
    content: 'Use array.sort((a, b) => a - b) for numbers',
    parentId: q1.id
  });
  await store.createBranch(sessionId, 'solution-2-numeric', sol2.id);

  // User picks solution 2 and continues
  const followUp = await store.append(sessionId, {
    type: 'user',
    role: 'user',
    content: 'Can you show an example?',
    parentId: sol2.id
  });

  const example = await store.append(sessionId, {
    type: 'assistant',
    role: 'assistant',
    content: 'Sure: [3, 1, 4].sort((a, b) => a - b) // [1, 3, 4]',
    parentId: followUp.id
  });

  // Final conversation path
  const finalHistory = await store.getLinearHistory(sessionId, example.id);
  console.log('Final conversation:', finalHistory.map(m => ({
    role: m.role,
    content: m.content
  })));

  // Show tree structure
  console.log('\nTree structure from root:');
  const tree = await store.getTree(sessionId, null);
  console.log(`Total messages in tree: ${tree.length}`);
}

// ============================================================================
// Run all examples
// ============================================================================

async function runAllExamples() {
  console.log('=== Example 1: Basic Usage ===');
  await example1_BasicUsage();

  console.log('\n=== Example 2: Branching ===');
  await example2_Branching();

  console.log('\n=== Example 3: Tree Structure ===');
  await example3_TreeStructure();

  console.log('\n=== Example 4: Locking ===');
  await example4_Locking();

  console.log('\n=== Example 5: withLock Helper ===');
  await example5_WithLock();

  console.log('\n=== Example 6: Auto-Reset ===');
  await example6_AutoReset();

  console.log('\n=== Example 7: Token-Based Reset ===');
  await example7_TokenBasedReset();

  console.log('\n=== Example 8: Persistence ===');
  await example8_Persistence();

  console.log('\n=== Example 9: Multiple Keys ===');
  await example9_MultipleKeys();

  console.log('\n=== Example 10: Complex Flow ===');
  await example10_ComplexFlow();
}

// Uncomment to run
// runAllExamples().catch(console.error);
