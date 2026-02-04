/**
 * Agent Loop Tests
 */

import { AgentLoop } from '../AgentLoop';
import { generateRunId, isValidRunId } from '../run-id-generator';
import type { AgentLoopDependencies } from '../types';

// ============================================================================
// Mocks
// ============================================================================

const createMockDeps = (): AgentLoopDependencies => {
  const sessionStore = {
    get: jest.fn(async (id) => null),
    append: jest.fn(async () => {}),
  };
  
  const contextAssembler = {
    assemble: jest.fn(async ({ input }) => ({
      systemPrompt: '',
      messages: [
        { role: 'user' as const, content: [{ type: 'text' as const, text: input }] },
      ],
      tools: [],
      model: 'gpt-4',
      parameters: {
        modelId: 'gpt-4',
        temperature: 0.7,
        maxTokens: 2000,
      },
      metadata: {
        tokens: { system: 0, messages: 10, tools: 0, total: 10 },
        counts: { messages: 1, tools: 0 },
        truncated: false,
        compacted: false,
      },
    })),
  };
  
  const modelAdapter = {
    stream: jest.fn(async function* ({ messages }) {
      yield { type: 'content', delta: 'Hello' };
      yield { type: 'content', delta: ' world' };
      yield {
        type: 'response',
        id: 'resp-1',
        content: 'Hello world',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      };
    }),
  };
  
  const toolExecutor = {
    execute: jest.fn(async ({ name, arguments: args }) => ({
      output: { result: `Tool ${name} executed` },
      success: true,
    })),
  };
  
  return {
    sessionStore,
    contextAssembler,
    modelAdapter,
    toolExecutor,
  };
};

// ============================================================================
// Tests
// ============================================================================

describe('AgentLoop', () => {
  let agentLoop: AgentLoop;
  let deps: AgentLoopDependencies;
  
  beforeEach(() => {
    deps = createMockDeps();
    agentLoop = new AgentLoop(deps);
  });
  
  describe('Run ID Generation', () => {
    it('should generate valid run IDs', () => {
      const runId = generateRunId();
      expect(isValidRunId(runId)).toBe(true);
      expect(runId).toMatch(/^run_\d+_[a-z0-9]{8}$/);
    });
    
    it('should generate unique IDs', () => {
      const id1 = generateRunId();
      const id2 = generateRunId();
      expect(id1).not.toBe(id2);
    });
  });
  
  describe('Basic Execution', () => {
    it('should execute simple run', async () => {
      const handle = await agentLoop.execute({
        message: 'Hello',
      });
      
      expect(handle.runId).toBeDefined();
      expect(handle.sessionId).toBeDefined();
      expect(handle.state).toBe('pending');
      
      // Collect events
      const events = [];
      for await (const event of handle.events) {
        events.push(event);
      }
      
      // Should have lifecycle events
      const types = events.map(e => e.type);
      expect(types).toContain('run.queued');
      expect(types).toContain('run.started');
      expect(types).toContain('context.start');
      expect(types).toContain('context.complete');
      expect(types).toContain('model.start');
      expect(types).toContain('model.delta');
      expect(types).toContain('model.complete');
      expect(types).toContain('run.completed');
    });
    
    it('should stream model deltas', async () => {
      const handle = await agentLoop.execute({
        message: 'Test',
      });
      
      const deltas: string[] = [];
      for await (const event of handle.events) {
        if (event.type === 'model.delta') {
          deltas.push(event.delta);
        }
      }
      
      expect(deltas.join('')).toBe('Hello world');
    });
    
    it('should save messages to session', async () => {
      const handle = await agentLoop.execute({
        message: 'Save test',
      });
      
      // Wait for completion
      for await (const event of handle.events) {
        if (event.type === 'run.completed') {
          break;
        }
      }
      
      expect(deps.sessionStore.append).toHaveBeenCalled();
    });
  });
  
  describe('Tool Execution', () => {
    it.todo('should execute tool calls');
    
    it.todo('should handle tool errors gracefully');
  });
  
  describe('Cancellation', () => {
    it('should cancel running run', async () => {
      // Mock long-running operation
      (deps.modelAdapter.stream as jest.Mock) = jest.fn(async function* () {
        await new Promise(resolve => setTimeout(resolve, 1000));
        yield { type: 'content', delta: 'Never' };
      });
      
      const handle = await agentLoop.execute({
        message: 'Cancel me',
      });
      
      // Cancel after a short delay
      setTimeout(() => handle.cancel(), 100);
      
      const events = [];
      for await (const event of handle.events) {
        events.push(event);
      }
      
      const types = events.map(e => e.type);
      expect(types).toContain('run.cancelled');
    });
  });
  
  describe('Hooks', () => {
    it('should execute lifecycle hooks', async () => {
      const beforeRun = jest.fn();
      const afterRun = jest.fn();
      
      agentLoop.on('beforeRun', beforeRun);
      agentLoop.on('afterRun', afterRun);
      
      const handle = await agentLoop.execute({
        message: 'Hook test',
      });
      
      for await (const event of handle.events) {
        if (event.type === 'run.completed') {
          break;
        }
      }
      
      expect(beforeRun).toHaveBeenCalled();
      expect(afterRun).toHaveBeenCalled();
    });
  });
  
  describe('Configuration', () => {
    it('should use custom config', () => {
      const customLoop = new AgentLoop(deps, {
        limits: {
          maxTurns: 5,
          maxToolRounds: 3,
          maxToolCallsPerRound: 5,
          queueTimeout: 10000,
        },
      });
      
      const config = customLoop.getConfig();
      expect(config.limits.maxTurns).toBe(5);
      expect(config.limits.maxToolRounds).toBe(3);
    });
    
    it('should update config', () => {
      agentLoop.configure({
        concurrency: {
          maxConcurrentRuns: 20,
          maxConcurrentToolCalls: 10,
        },
      });
      
      const config = agentLoop.getConfig();
      expect(config.concurrency.maxConcurrentRuns).toBe(20);
    });
  });
});
