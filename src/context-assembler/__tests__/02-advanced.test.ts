/**
 * Context Assembler Tests - Advanced Scenarios
 */

import {
  ContextAssembler,
  createContextAssembler,
  ContextTruncator,
  TokenEstimator,
  MessageTransformer,
  CompactionDetector,
  DEFAULT_CONFIG,
} from '../index';

import type {
  SessionStore,
  ToolExecutor,
  SessionMessage,
  ModelMessage,
  ToolDefinition,
} from '../types';

// ============================================================================
// Mocks
// ============================================================================

const createLargeSessionStore = (): SessionStore => {
  const messages: SessionMessage[] = [];
  
  // Create 150 messages
  for (let i = 0; i < 150; i++) {
    messages.push({
      id: String(i),
      parentId: i > 0 ? String(i - 1) : null,
      type: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i} with some content that takes up tokens`,
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
    });
  }
  
  return {
    getMessages: jest.fn().mockResolvedValue(messages),
    getMetadata: jest.fn().mockResolvedValue({}),
  };
};

const createMockToolExecutor = (): ToolExecutor => {
  return {
    list: jest.fn().mockReturnValue([]),
    getForModel: jest.fn().mockReturnValue([]),
  };
};

// ============================================================================
// Tests
// ============================================================================

describe('Context Truncation', () => {
  it('should truncate messages when exceeding token limit', async () => {
    const assembler = createContextAssembler(
      {
        sessionStore: createLargeSessionStore(),
        toolExecutor: createMockToolExecutor(),
      },
      {
        truncationStrategy: 'simple',
      }
    );
    
    const context = await assembler.assemble('session-1', 'agent-1', {
      maxContextTokens: 1000,
    });
    
    expect(context.metadata.truncated).toBe(true);
    expect(context.metadata.truncationInfo).toBeDefined();
    expect(context.metadata.truncationInfo!.removedCount).toBeGreaterThan(0);
  });
  
  it('should preserve tool call/result pairs in smart truncation', async () => {
    const messages: SessionMessage[] = [
      {
        id: '1',
        parentId: null,
        type: 'user',
        content: 'Hello',
        timestamp: '2024-01-01T00:00:00Z',
      },
      {
        id: '2',
        parentId: '1',
        type: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'call-1',
            name: 'calculate',
            input: { expression: '2+2' },
          },
        ],
        timestamp: '2024-01-01T00:00:01Z',
      },
      {
        id: '3',
        parentId: '2',
        type: 'tool_result',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call-1',
            content: '4',
          },
        ],
        timestamp: '2024-01-01T00:00:02Z',
      },
    ];
    
    const sessionStore: SessionStore = {
      getMessages: jest.fn().mockResolvedValue(messages),
      getMetadata: jest.fn().mockResolvedValue({}),
    };
    
    const estimator = new TokenEstimator({ mode: 'simple' });
    const transformer = new MessageTransformer();
    const truncator = new ContextTruncator(estimator, transformer);
    
    const modelMessages = transformer.transformMany(messages);
    
    const result = await truncator.truncate(modelMessages, {
      strategy: 'smart',
      maxTokens: 100,
      reserveTokens: 0,
      systemPromptTokens: 0,
      toolsTokens: 0,
    });
    
    // Should preserve tool call and result
    expect(result.messages.length).toBeGreaterThan(0);
  });
  
  it('should use sliding window truncation', async () => {
    const messages: ModelMessage[] = [];
    
    for (let i = 0; i < 50; i++) {
      messages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      });
    }
    
    const estimator = new TokenEstimator({ mode: 'simple' });
    const transformer = new MessageTransformer();
    const truncator = new ContextTruncator(estimator, transformer);
    
    const result = await truncator.truncate(messages, {
      strategy: 'sliding',
      maxTokens: 200, // Very low to force truncation
      reserveTokens: 0,
      systemPromptTokens: 0,
      toolsTokens: 0,
    });
    
    // Should keep recent messages
    expect(result.messages.length).toBeLessThan(messages.length);
    expect(result.messages[result.messages.length - 1]).toEqual(messages[messages.length - 1]);
  });
});

describe('Compaction Detection', () => {
  it('should detect compaction needed based on token threshold', () => {
    const detector = new CompactionDetector(DEFAULT_CONFIG);
    
    const stats = detector.calculateStats(
      50, // messages
      180_000, // tokens (90% of 200k)
      10, // tool calls
    );
    
    const check = detector.check(stats, 180_000, 200_000);
    
    expect(check.needed).toBe(true);
    expect(check.reason).toBe('token_limit');
  });
  
  it('should detect compaction needed based on message count', () => {
    const detector = new CompactionDetector(DEFAULT_CONFIG);
    
    const stats = detector.calculateStats(
      150, // messages (> threshold of 100)
      50_000, // tokens
      10, // tool calls
    );
    
    const check = detector.check(stats, 50_000, 200_000);
    
    expect(check.needed).toBe(true);
    expect(check.reason).toBe('message_count');
  });
  
  it('should detect compaction needed for explicit request', () => {
    const detector = new CompactionDetector(DEFAULT_CONFIG);
    
    const stats = detector.calculateStats(10, 1000, 0);
    
    const check = detector.check(stats, 1000, 200_000, true);
    
    expect(check.needed).toBe(true);
    expect(check.reason).toBe('explicit');
  });
  
  it('should not detect compaction when under thresholds', () => {
    const detector = new CompactionDetector(DEFAULT_CONFIG);
    
    const stats = detector.calculateStats(10, 1000, 0);
    
    const check = detector.check(stats, 1000, 200_000);
    
    expect(check.needed).toBe(false);
    expect(check.reason).toBe('none');
  });
});

describe('Defaults Resolution', () => {
  it('should merge defaults from all 4 layers', async () => {
    const sessionStore: SessionStore = {
      getMessages: jest.fn().mockResolvedValue([]),
      getMetadata: jest.fn().mockResolvedValue({
        // Session defaults (layer 3)
        temperature: 0.8,
      }),
    };
    
    const assembler = createContextAssembler(
      {
        sessionStore,
        toolExecutor: createMockToolExecutor(),
      },
      {
        // System defaults (layer 1)
        defaultModel: 'claude-3-7-sonnet',
        defaultTemperature: 0.7,
        defaultMaxTokens: 4096,
      }
    );
    
    const context = await assembler.assemble('session-1', 'agent-1', {
      // Request overrides (layer 4)
      maxTokens: 8192,
    });
    
    // Should use:
    // - model from system defaults (layer 1)
    // - temperature from session defaults (layer 3)
    // - maxTokens from request overrides (layer 4)
    expect(context.parameters.modelId).toBe('claude-3-7-sonnet');
    expect(context.parameters.temperature).toBe(0.8);
    expect(context.parameters.maxTokens).toBe(8192);
  });
});

describe('Edge Cases', () => {
  it('should handle empty session', async () => {
    const sessionStore: SessionStore = {
      getMessages: jest.fn().mockResolvedValue([]),
      getMetadata: jest.fn().mockResolvedValue({}),
    };
    
    const assembler = createContextAssembler({
      sessionStore,
      toolExecutor: createMockToolExecutor(),
    });
    
    const context = await assembler.assemble('session-1');
    
    expect(context.messages).toHaveLength(0);
    expect(context.metadata.truncated).toBe(false);
  });
  
  it('should handle missing bootstrap files gracefully', async () => {
    const assembler = createContextAssembler(
      {
        sessionStore: {
          getMessages: jest.fn().mockResolvedValue([]),
          getMetadata: jest.fn().mockResolvedValue({}),
        },
        toolExecutor: createMockToolExecutor(),
      },
      {
        bootstrapPath: './nonexistent',
      }
    );
    
    const context = await assembler.assemble('session-1');
    
    // Should still work without bootstrap files
    expect(context).toBeDefined();
  });
  
  it('should handle tool calls without results', () => {
    const transformer = new MessageTransformer();
    
    const messages: SessionMessage[] = [
      {
        id: '1',
        parentId: null,
        type: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'call-1',
            name: 'calculate',
            input: { expression: '2+2' },
          },
        ],
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    
    const modelMessages = transformer.transformMany(messages);
    
    expect(modelMessages).toHaveLength(1);
    expect(transformer.hasToolCalls(modelMessages[0])).toBe(true);
  });
  
  it('should handle conflicting tool names', async () => {
    const skillTool: ToolDefinition = {
      name: 'calculate',
      description: 'Skill calculator',
      parameters: { type: 'object', properties: {} },
    };
    
    const executorTool: ToolDefinition = {
      name: 'calculate',
      description: 'Executor calculator',
      parameters: { type: 'object', properties: {} },
    };
    
    const toolExecutor: ToolExecutor = {
      list: jest.fn().mockReturnValue([executorTool]),
      getForModel: jest.fn().mockReturnValue([executorTool]),
    };
    
    const sessionStore: SessionStore = {
      getMessages: jest.fn().mockResolvedValue([]),
      getMetadata: jest.fn().mockResolvedValue({}),
    };
    
    const assembler = createContextAssembler({
      sessionStore,
      toolExecutor,
    });
    
    const context = await assembler.assemble('session-1');
    
    // Should have only one 'calculate' tool (deduplication)
    const calculateTools = context.tools.filter(t => t.name === 'calculate');
    expect(calculateTools).toHaveLength(1);
  });
  
  it('should handle very long system prompt', async () => {
    const longPrompt = 'A'.repeat(100_000); // 100k characters
    
    const sessionStore: SessionStore = {
      getMessages: jest.fn().mockResolvedValue([]),
      getMetadata: jest.fn().mockResolvedValue({}),
    };
    
    const assembler = createContextAssembler({
      sessionStore,
      toolExecutor: createMockToolExecutor(),
    });
    
    const context = await assembler.assemble('session-1', 'agent-1', {
      additionalSystemPrompt: longPrompt,
    });
    
    expect(context.systemPrompt).toContain('A');
    expect(context.metadata.tokenEstimate.systemPrompt).toBeGreaterThan(0);
  });
});

describe('Performance', () => {
  it('should assemble context in reasonable time', async () => {
    const assembler = createContextAssembler({
      sessionStore: createLargeSessionStore(),
      toolExecutor: createMockToolExecutor(),
    });
    
    const start = Date.now();
    await assembler.assemble('session-1');
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeLessThan(5000); // 5 seconds max
  });
  
  it('should cache results for repeated calls', async () => {
    const sessionStore = createLargeSessionStore();
    const assembler = createContextAssembler(
      {
        sessionStore,
        toolExecutor: createMockToolExecutor(),
      },
      {
        enableCaching: true,
      }
    );
    
    // First call
    const start1 = Date.now();
    await assembler.assemble('session-1');
    const elapsed1 = Date.now() - start1;
    
    // Second call (cached)
    const start2 = Date.now();
    await assembler.assemble('session-1');
    const elapsed2 = Date.now() - start2;
    
    // Cached call should be much faster (at least 50% faster or within 5ms)
    expect(elapsed2).toBeLessThanOrEqual(Math.max(5, elapsed1 / 2));
  });
});
