/**
 * Basic Tool Executor Tests
 * 
 * Tests for core functionality: registration, validation, execution, hooks.
 */

import { ToolExecutor } from '../ToolExecutor';
import type { ToolDefinition, ToolHandler, ExecutionContext, ToolResult } from '../types';

describe('Tool Executor - Basic Functionality', () => {
  let executor: ToolExecutor;
  
  beforeEach(() => {
    executor = new ToolExecutor({
      defaultTimeout: 5000,
      maxResultLength: 1000
    });
  });
  
  afterEach(() => {
    executor.clear();
  });
  
  // ========================================================================
  // Tool Registration
  // ========================================================================
  
  describe('Tool Registration', () => {
    it('should register a simple tool', () => {
      const definition: ToolDefinition = {
        name: 'echo',
        description: 'Echo back the input',
        parameters: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Message to echo'
            }
          },
          required: ['message']
        }
      };
      
      const handler: ToolHandler = async (params) => ({
        content: params.message as string,
        success: true
      });
      
      executor.register(definition, handler);
      
      expect(executor.has('echo')).toBe(true);
      expect(executor.get('echo')).toBeTruthy();
    });
    
    it('should reject invalid tool definition', () => {
      const invalidDefinition = {
        name: '',  // Empty name
        description: 'Test',
        parameters: {
          type: 'object',
          properties: {}
        }
      } as ToolDefinition;
      
      const handler: ToolHandler = async () => ({ content: 'test', success: true });
      
      expect(() => {
        executor.register(invalidDefinition, handler);
      }).toThrow();
    });
    
    it('should prevent duplicate registration', () => {
      const definition: ToolDefinition = {
        name: 'duplicate',
        description: 'Test',
        parameters: {
          type: 'object',
          properties: {}
        }
      };
      
      const handler: ToolHandler = async () => ({ content: 'test', success: true });
      
      executor.register(definition, handler);
      
      expect(() => {
        executor.register(definition, handler);
      }).toThrow(/already registered/i);
    });
    
    it('should unregister a tool', () => {
      const definition: ToolDefinition = {
        name: 'temp',
        description: 'Temporary tool',
        parameters: {
          type: 'object',
          properties: {}
        }
      };
      
      const handler: ToolHandler = async () => ({ content: 'test', success: true });
      
      executor.register(definition, handler);
      expect(executor.has('temp')).toBe(true);
      
      const result = executor.unregister('temp');
      expect(result).toBe(true);
      expect(executor.has('temp')).toBe(false);
    });
  });
  
  // ========================================================================
  // Tool Discovery
  // ========================================================================
  
  describe('Tool Discovery', () => {
    beforeEach(() => {
      // Register multiple tools
      executor.register({
        name: 'read_file',
        description: 'Read a file',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' }
          },
          required: ['path']
        },
        metadata: {
          category: 'filesystem',
          permissions: ['fs.read']
        }
      }, async () => ({ content: 'file contents', success: true }));
      
      executor.register({
        name: 'write_file',
        description: 'Write a file',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' }
          },
          required: ['path', 'content']
        },
        metadata: {
          category: 'filesystem',
          permissions: ['fs.write'],
          dangerous: true
        }
      }, async () => ({ content: 'written', success: true }));
      
      executor.register({
        name: 'bash',
        description: 'Execute command',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string' }
          },
          required: ['command']
        },
        metadata: {
          category: 'system',
          permissions: ['process.exec'],
          dangerous: true
        }
      }, async () => ({ content: 'output', success: true }));
    });
    
    it('should list all tools', () => {
      const tools = executor.list({ includeDangerous: true });
      expect(tools).toHaveLength(3);
    });
    
    it('should filter by category', () => {
      const tools = executor.list({ category: 'filesystem', includeDangerous: true });
      expect(tools).toHaveLength(2);
      expect(tools.map(t => t.name)).toEqual(expect.arrayContaining(['read_file', 'write_file']));
    });
    
    it('should filter by permissions', () => {
      const tools = executor.list({ permissions: ['fs.read'] });
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.some(t => t.name === 'read_file')).toBe(true);
    });
    
    it('should exclude dangerous tools by default', () => {
      const tools = executor.list();
      expect(tools.some(t => t.metadata?.dangerous)).toBe(false);
    });
    
    it('should include dangerous tools when requested', () => {
      const tools = executor.list({ includeDangerous: true });
      expect(tools.some(t => t.metadata?.dangerous)).toBe(true);
    });
    
    it('should search by name', () => {
      const tools = executor.list({ search: 'file', includeDangerous: true });
      expect(tools).toHaveLength(2);
    });
    
    it('should get categories', () => {
      const categories = executor.categories();
      expect(categories).toContain('filesystem');
      expect(categories).toContain('system');
    });
  });
  
  // ========================================================================
  // Parameter Validation
  // ========================================================================
  
  describe('Parameter Validation', () => {
    beforeEach(() => {
      executor.register({
        name: 'test_params',
        description: 'Test parameter validation',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              minLength: 1,
              maxLength: 50
            },
            age: {
              type: 'integer',
              minimum: 0,
              maximum: 150
            },
            active: {
              type: 'boolean',
              default: true
            },
            tags: {
              type: 'array',
              items: {
                type: 'string'
              }
            }
          },
          required: ['name']
        }
      }, async (params) => ({
        content: JSON.stringify(params),
        success: true
      }));
    });
    
    it('should validate correct parameters', () => {
      const result = executor.validate('test_params', {
        name: 'John',
        age: 30,
        tags: ['developer', 'tester']
      });
      
      expect(result.valid).toBe(true);
    });
    
    it('should reject missing required field', () => {
      const result = executor.validate('test_params', {
        age: 30
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].code).toBe('REQUIRED_FIELD');
    });
    
    it('should reject invalid type', () => {
      const result = executor.validate('test_params', {
        name: 'John',
        age: 'thirty'  // Should be number
      });
      
      expect(result.valid).toBe(false);
    });
    
    it('should apply default values', () => {
      const result = executor.validate('test_params', {
        name: 'John'
      });
      
      expect(result.valid).toBe(true);
      expect(result.coerced).toBeDefined();
      expect(result.coerced!.active).toBe(true);
    });
    
    it('should coerce types', () => {
      const result = executor.validate('test_params', {
        name: 'John',
        age: '30'  // String that can be coerced to number
      });
      
      expect(result.valid).toBe(true);
      expect(result.coerced!.age).toBe(30);
    });
  });
  
  // ========================================================================
  // Tool Execution
  // ========================================================================
  
  describe('Tool Execution', () => {
    it('should execute a simple tool', async () => {
      executor.register({
        name: 'greet',
        description: 'Greet someone',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string' }
          },
          required: ['name']
        }
      }, async (params) => ({
        content: `Hello, ${params.name}!`,
        success: true
      }));
      
      const context = executor.createContext({
        sessionId: 'test-session',
        runId: 'test-run',
        toolCallId: 'call-1'
      });
      
      const result = await executor.execute('greet', { name: 'World' }, context);
      
      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello, World!');
    });
    
    it('should handle tool not found', async () => {
      const context = executor.createContext({
        sessionId: 'test-session',
        runId: 'test-run',
        toolCallId: 'call-1'
      });
      
      const result = await executor.execute('nonexistent', {}, context);
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TOOL_NOT_FOUND');
    });
    
    it('should handle invalid parameters', async () => {
      executor.register({
        name: 'add',
        description: 'Add numbers',
        parameters: {
          type: 'object',
          properties: {
            a: { type: 'number' },
            b: { type: 'number' }
          },
          required: ['a', 'b']
        }
      }, async (params) => ({
        content: String((params.a as number) + (params.b as number)),
        success: true
      }));
      
      const context = executor.createContext({
        sessionId: 'test-session',
        runId: 'test-run',
        toolCallId: 'call-1'
      });
      
      const result = await executor.execute('add', { a: 5 }, context);
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });
    
    it('should handle tool errors', async () => {
      executor.register({
        name: 'failing_tool',
        description: 'Always fails',
        parameters: {
          type: 'object',
          properties: {}
        }
      }, async () => {
        throw new Error('Tool failed');
      });
      
      const context = executor.createContext({
        sessionId: 'test-session',
        runId: 'test-run',
        toolCallId: 'call-1'
      });
      
      const result = await executor.execute('failing_tool', {}, context);
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Tool failed');
    });
    
    it('should timeout long-running tools', async () => {
      executor.register({
        name: 'slow_tool',
        description: 'Takes too long',
        parameters: {
          type: 'object',
          properties: {}
        }
      }, async () => {
        await new Promise(resolve => setTimeout(resolve, 10000));
        return { content: 'done', success: true };
      });
      
      const context = executor.createContext({
        sessionId: 'test-session',
        runId: 'test-run',
        toolCallId: 'call-1',
        timeout: 100
      });
      
      const result = await executor.execute('slow_tool', {}, context);
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT');
    }, 10000);
  });
  
  // ========================================================================
  // Statistics
  // ========================================================================
  
  describe('Statistics', () => {
    it('should track execution count', async () => {
      executor.register({
        name: 'counter',
        description: 'Test tool',
        parameters: {
          type: 'object',
          properties: {}
        }
      }, async () => ({ content: 'ok', success: true }));
      
      const context = executor.createContext({
        sessionId: 'test-session',
        runId: 'test-run',
        toolCallId: 'call-1'
      });
      
      await executor.execute('counter', {}, context);
      await executor.execute('counter', {}, context);
      await executor.execute('counter', {}, context);
      
      const introspection = executor.introspect('counter');
      expect(introspection).toBeTruthy();
      expect(introspection!.executionCount).toBe(3);
    });
    
    it('should provide registry statistics', async () => {
      executor.register({
        name: 'tool1',
        description: 'Tool 1',
        parameters: { type: 'object', properties: {} }
      }, async () => ({ content: 'ok', success: true }));
      
      executor.register({
        name: 'tool2',
        description: 'Tool 2',
        parameters: { type: 'object', properties: {} }
      }, async () => ({ content: 'ok', success: true }));
      
      const stats = executor.getStats();
      
      expect(stats.totalTools).toBe(2);
      expect(stats.totalExecutions).toBeGreaterThanOrEqual(0);
    });
  });
});
