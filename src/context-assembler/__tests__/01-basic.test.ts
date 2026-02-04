/**
 * Context Assembler Tests - Basic Functionality
 */

import {
  ContextAssembler,
  createContextAssembler,
  TokenEstimator,
  MessageTransformer,
  ToolCollector,
  SystemPromptBuilder,
  getModelLimits,
  listSupportedModels,
} from '../index';

import type {
  SessionStore,
  ToolExecutor,
  SkillProvider,
  SessionMessage,
  ToolDefinition,
  Skill,
} from '../types';

// ============================================================================
// Mocks
// ============================================================================

const createMockSessionStore = (): SessionStore => {
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
      content: 'Hi! How can I help?',
      timestamp: '2024-01-01T00:00:01Z',
    },
  ];
  
  return {
    getMessages: jest.fn().mockResolvedValue(messages),
    getMetadata: jest.fn().mockResolvedValue({}),
  };
};

const createMockToolExecutor = (): ToolExecutor => {
  const tools: ToolDefinition[] = [
    {
      name: 'calculate',
      description: 'Perform calculations',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string' },
        },
        required: ['expression'],
      },
    },
    {
      name: 'search',
      description: 'Search the web',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  ];
  
  return {
    list: jest.fn().mockReturnValue(tools),
    getForModel: jest.fn().mockReturnValue(tools),
  };
};

const createMockSkillProvider = (): SkillProvider => {
  const skills: Skill[] = [
    {
      id: 'math',
      name: 'Mathematics',
      instructions: 'You are good at math',
      priority: 100,
    },
  ];
  
  return {
    getActiveSkills: jest.fn().mockResolvedValue(skills),
    getSkillInstructions: jest.fn().mockResolvedValue('You are good at math'),
    getSkillTools: jest.fn().mockResolvedValue([]),
    getSkillPriority: jest.fn().mockResolvedValue(100),
  };
};

// ============================================================================
// Tests
// ============================================================================

describe('ContextAssembler', () => {
  describe('initialization', () => {
    it('should create assembler with default config', () => {
      const assembler = createContextAssembler({
        sessionStore: createMockSessionStore(),
        toolExecutor: createMockToolExecutor(),
      });
      
      expect(assembler).toBeDefined();
      expect(assembler.getConfig().defaultModel).toBe('ollama/gpt-oss:20b');
    });
    
    it('should create assembler with custom config', () => {
      const assembler = createContextAssembler(
        {
          sessionStore: createMockSessionStore(),
          toolExecutor: createMockToolExecutor(),
        },
        {
          defaultModel: 'gpt-4o',
          defaultTemperature: 0.5,
        }
      );
      
      const config = assembler.getConfig();
      expect(config.defaultModel).toBe('gpt-4o');
      expect(config.defaultTemperature).toBe(0.5);
    });
  });
  
  describe('assemble()', () => {
    it('should assemble basic context', async () => {
      const assembler = createContextAssembler({
        sessionStore: createMockSessionStore(),
        toolExecutor: createMockToolExecutor(),
      });
      
      const context = await assembler.assemble('session-1');
      
      expect(context).toBeDefined();
      expect(context.systemPrompt).toBeDefined();
      expect(context.messages).toHaveLength(2);
      expect(context.tools).toHaveLength(2);
      expect(context.parameters.modelId).toBe('ollama/gpt-oss:20b');
      expect(context.metadata.sessionId).toBe('session-1');
    });
    
    it('should include skills in context', async () => {
      const assembler = createContextAssembler({
        sessionStore: createMockSessionStore(),
        toolExecutor: createMockToolExecutor(),
        skillProvider: createMockSkillProvider(),
      });
      
      const context = await assembler.assemble('session-1', 'agent-1');
      
      expect(context.metadata.activeSkills).toContain('math');
    });
    
    it('should apply model overrides', async () => {
      const assembler = createContextAssembler({
        sessionStore: createMockSessionStore(),
        toolExecutor: createMockToolExecutor(),
      });
      
      const context = await assembler.assemble('session-1', 'agent-1', {
        modelId: 'gpt-4o',
        temperature: 0.9,
      });
      
      expect(context.parameters.modelId).toBe('gpt-4o');
      expect(context.parameters.temperature).toBe(0.9);
    });
  });
  
  describe('checkCompaction()', () => {
    it('should detect when compaction is not needed', async () => {
      const assembler = createContextAssembler({
        sessionStore: createMockSessionStore(),
        toolExecutor: createMockToolExecutor(),
      });
      
      const check = await assembler.checkCompaction('session-1');
      
      expect(check.needed).toBe(false);
      expect(check.reason).toBe('none');
    });
  });
  
  describe('caching', () => {
    it('should cache assembled contexts', async () => {
      const sessionStore = createMockSessionStore();
      const assembler = createContextAssembler({
        sessionStore,
        toolExecutor: createMockToolExecutor(),
      }, {
        enableCaching: true,
      });
      
      // First call
      await assembler.assemble('session-1');
      
      // Second call (should use cache)
      await assembler.assemble('session-1');
      
      // Session store should only be called once
      expect(sessionStore.getMessages).toHaveBeenCalledTimes(1);
    });
    
    it('should invalidate cache for session', async () => {
      const sessionStore = createMockSessionStore();
      const assembler = createContextAssembler({
        sessionStore,
        toolExecutor: createMockToolExecutor(),
      }, {
        enableCaching: true,
      });
      
      // First call
      await assembler.assemble('session-1');
      
      // Invalidate cache
      assembler.invalidateCache('session-1');
      
      // Second call (should not use cache)
      await assembler.assemble('session-1');
      
      // Session store should be called twice
      expect(sessionStore.getMessages).toHaveBeenCalledTimes(2);
    });
    
    it('should get cache stats', async () => {
      const assembler = createContextAssembler({
        sessionStore: createMockSessionStore(),
        toolExecutor: createMockToolExecutor(),
      });
      
      await assembler.assemble('session-1');
      
      const stats = assembler.getCacheStats();
      
      expect(stats).toBeDefined();
      expect(stats.assembly).toBeDefined();
      expect(stats.bootstrap).toBeDefined();
    });
  });
});

describe('TokenEstimator', () => {
  it('should estimate text tokens', async () => {
    const estimator = new TokenEstimator({ mode: 'simple' });
    
    const tokens = await estimator.estimateText('Hello, world!');
    
    expect(tokens).toBeGreaterThan(0);
  });
  
  it('should estimate Russian text correctly', async () => {
    const estimator = new TokenEstimator({ mode: 'simple' });
    
    const englishTokens = await estimator.estimateText('Hello');
    const russianTokens = await estimator.estimateText('Привет');
    
    // Russian should use more tokens per character
    expect(russianTokens).toBeGreaterThan(englishTokens / 2);
  });
  
  it('should estimate image blocks', async () => {
    const estimator = new TokenEstimator({ mode: 'simple' });
    
    const tokens = await estimator.estimateContentBlock({
      type: 'image',
      source: {
        type: 'base64',
        data: 'abc123',
      },
    });
    
    expect(tokens).toBe(85); // Small image
  });
});

describe('MessageTransformer', () => {
  it('should transform session messages to model messages', () => {
    const transformer = new MessageTransformer();
    
    const sessionMessages: SessionMessage[] = [
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
        content: 'Hi!',
        timestamp: '2024-01-01T00:00:01Z',
      },
    ];
    
    const modelMessages = transformer.transformMany(sessionMessages);
    
    expect(modelMessages).toHaveLength(2);
    expect(modelMessages[0].role).toBe('user');
    expect(modelMessages[1].role).toBe('assistant');
  });
  
  it('should merge consecutive messages with same role', () => {
    const transformer = new MessageTransformer();
    
    const messages = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'user' as const, content: 'World' },
    ];
    
    const merged = transformer.mergeConsecutive(messages);
    
    expect(merged).toHaveLength(1);
    expect(merged[0].content).toContain('Hello');
    expect(merged[0].content).toContain('World');
  });
});

describe('ModelLimits', () => {
  it('should list all supported models', () => {
    const models = listSupportedModels();
    
    expect(models.length).toBeGreaterThan(0);
    expect(models).toContain('claude-3-7-sonnet');
    expect(models).toContain('gpt-4o');
  });
  
  it('should get limits for known model', () => {
    const limits = getModelLimits('claude-3-7-sonnet');
    
    expect(limits.contextWindow).toBe(200_000);
    expect(limits.maxOutput).toBe(8_192);
    expect(limits.supportsTools).toBe(true);
    expect(limits.supportsThinking).toBe(true);
  });
  
  it('should fallback to defaults for unknown model', () => {
    const limits = getModelLimits('unknown-model');
    
    expect(limits.contextWindow).toBe(8_192);
  });
});

describe('SystemPromptBuilder', () => {
  it('should build prompt from sections', () => {
    const builder = new SystemPromptBuilder();
    
    const sections = [
      { name: 'intro', content: 'You are a helpful assistant', priority: 100 },
      { name: 'rules', content: 'Be concise', priority: 50 },
    ];
    
    const prompt = builder.build(sections);
    
    expect(prompt).toContain('helpful assistant');
    expect(prompt).toContain('Be concise');
  });
  
  it('should sort sections by priority', () => {
    const builder = new SystemPromptBuilder();
    
    const sections = [
      { name: 'low', content: 'Low priority', priority: 10 },
      { name: 'high', content: 'High priority', priority: 100 },
    ];
    
    const prompt = builder.build(sections);
    
    expect(prompt.indexOf('High priority')).toBeLessThan(prompt.indexOf('Low priority'));
  });
});

describe('ToolCollector', () => {
  it('should collect tools from executor', async () => {
    const toolExecutor = createMockToolExecutor();
    const collector = new ToolCollector(toolExecutor);
    
    const tools = await collector.collectFromExecutor();
    
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('calculate');
  });
  
  it('should merge tools from multiple sources', () => {
    const toolExecutor = createMockToolExecutor();
    const collector = new ToolCollector(toolExecutor);
    
    const set1: ToolDefinition[] = [
      {
        name: 'tool1',
        description: 'Tool 1',
        parameters: { type: 'object', properties: {} },
      },
    ];
    
    const set2: ToolDefinition[] = [
      {
        name: 'tool2',
        description: 'Tool 2',
        parameters: { type: 'object', properties: {} },
      },
    ];
    
    const merged = collector.mergeTools(set1, set2);
    
    expect(merged).toHaveLength(2);
  });
});
