/**
 * Advanced Tool Executor Tests
 * 
 * Tests for hooks, permissions, concurrent execution, nested calls.
 */

import { ToolExecutor } from '../ToolExecutor';
import type { BeforeHook, AfterHook, ErrorHook, ToolResult } from '../types';

describe('Tool Executor - Advanced Features', () => {
  let executor: ToolExecutor;
  
  beforeEach(() => {
    executor = new ToolExecutor({
      defaultTimeout: 5000,
      maxResultLength: 500,
      truncationStrategy: 'middle'
    });
  });
  
  afterEach(() => {
    executor.clear();
  });
  
  // ========================================================================
  // Hooks
  // ========================================================================
  
  describe('Hooks', () => {
    it('should execute before hooks', async () => {
      const hookCalls: string[] = [];
      
      const beforeHook: BeforeHook = {
        name: 'test_before',
        priority: 100,
        handler: (context) => {
          hookCalls.push(`before:${context.toolName}`);
          return { proceed: true };
        }
      };
      
      executor.addBeforeHook(beforeHook);
      
      executor.register({
        name: 'test_tool',
        description: 'Test',
        parameters: { type: 'object', properties: {} }
      }, async () => {
        hookCalls.push('handler');
        return { content: 'ok', success: true };
      });
      
      const context = executor.createContext({
        sessionId: 'test',
        runId: 'run1',
        toolCallId: 'call1'
      });
      
      await executor.execute('test_tool', {}, context);
      
      expect(hookCalls).toContain('before:test_tool');
      expect(hookCalls).toContain('handler');
    });
    
    it('should block execution if before hook returns proceed: false', async () => {
      const hookCalls: string[] = [];
      
      const blockingHook: BeforeHook = {
        name: 'blocker',
        priority: 100,
        handler: () => ({
          proceed: false,
          reason: 'Blocked by test'
        })
      };
      
      executor.addBeforeHook(blockingHook);
      
      executor.register({
        name: 'blocked_tool',
        description: 'Should not execute',
        parameters: { type: 'object', properties: {} }
      }, async () => {
        hookCalls.push('handler');
        return { content: 'ok', success: true };
      });
      
      const context = executor.createContext({
        sessionId: 'test',
        runId: 'run1',
        toolCallId: 'call1'
      });
      
      const result = await executor.execute('blocked_tool', {}, context);
      
      expect(result.success).toBe(false);
      expect(hookCalls).not.toContain('handler');
    });
    
    it('should modify parameters in before hook', async () => {
      let receivedParams: any;
      
      const modifyHook: BeforeHook = {
        name: 'modifier',
        priority: 100,
        handler: (context) => ({
          proceed: true,
          params: {
            ...context.params,
            modified: true
          }
        })
      };
      
      executor.addBeforeHook(modifyHook);
      
      executor.register({
        name: 'param_tool',
        description: 'Test',
        parameters: {
          type: 'object',
          properties: {
            value: { type: 'string' },
            modified: { type: 'boolean' }
          }
        }
      }, async (params) => {
        receivedParams = params;
        return { content: 'ok', success: true };
      });
      
      const context = executor.createContext({
        sessionId: 'test',
        runId: 'run1',
        toolCallId: 'call1'
      });
      
      await executor.execute('param_tool', { value: 'test' }, context);
      
      expect(receivedParams.modified).toBe(true);
    });
    
    it('should execute after hooks', async () => {
      const hookCalls: string[] = [];
      
      const afterHook: AfterHook = {
        name: 'test_after',
        priority: 100,
        handler: (context) => {
          hookCalls.push(`after:${context.toolName}:${context.result.success}`);
          return context.result;
        }
      };
      
      executor.addAfterHook(afterHook);
      
      executor.register({
        name: 'test_tool',
        description: 'Test',
        parameters: { type: 'object', properties: {} }
      }, async () => {
        hookCalls.push('handler');
        return { content: 'ok', success: true };
      });
      
      const context = executor.createContext({
        sessionId: 'test',
        runId: 'run1',
        toolCallId: 'call1'
      });
      
      await executor.execute('test_tool', {}, context);
      
      expect(hookCalls).toContain('handler');
      expect(hookCalls).toContain('after:test_tool:true');
    });
    
    it('should modify result in after hook', async () => {
      const afterHook: AfterHook = {
        name: 'result_modifier',
        priority: 100,
        handler: (context) => ({
          ...context.result,
          content: 'Modified: ' + context.result.content
        })
      };
      
      executor.addAfterHook(afterHook);
      
      executor.register({
        name: 'test_tool',
        description: 'Test',
        parameters: { type: 'object', properties: {} }
      }, async () => ({ content: 'original', success: true }));
      
      const context = executor.createContext({
        sessionId: 'test',
        runId: 'run1',
        toolCallId: 'call1'
      });
      
      const result = await executor.execute('test_tool', {}, context);
      
      expect(result.content).toBe('Modified: original');
    });
    
    it('should execute error hooks on failure', async () => {
      let errorHookCalled = false;
      
      const errorHook: ErrorHook = {
        name: 'error_handler',
        priority: 100,
        handler: (context) => {
          errorHookCalled = true;
          // Return fallback result
          return {
            content: 'Fallback from error hook',
            success: true
          };
        }
      };
      
      executor.addErrorHook(errorHook);
      
      executor.register({
        name: 'failing_tool',
        description: 'Fails',
        parameters: { type: 'object', properties: {} }
      }, async () => {
        throw new Error('Tool error');
      });
      
      const context = executor.createContext({
        sessionId: 'test',
        runId: 'run1',
        toolCallId: 'call1'
      });
      
      const result = await executor.execute('failing_tool', {}, context);
      
      expect(errorHookCalled).toBe(true);
      expect(result.success).toBe(true);
      expect(result.content).toBe('Fallback from error hook');
    });
  });
  
  // ========================================================================
  // Permissions
  // ========================================================================
  
  describe('Permissions', () => {
    it('should block tool without required permissions', async () => {
      executor.register({
        name: 'privileged_tool',
        description: 'Requires permissions',
        parameters: { type: 'object', properties: {} },
        metadata: {
          permissions: ['fs.write', 'fs.delete']
        }
      }, async () => ({ content: 'ok', success: true }));
      
      const context = executor.createContext({
        sessionId: 'test',
        runId: 'run1',
        toolCallId: 'call1',
        permissions: ['fs.read']  // Missing fs.write and fs.delete
      });
      
      const result = await executor.execute('privileged_tool', {}, context);
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PERMISSION_DENIED');
    });
    
    it('should allow tool with all required permissions', async () => {
      executor.register({
        name: 'allowed_tool',
        description: 'Has permissions',
        parameters: { type: 'object', properties: {} },
        metadata: {
          permissions: ['fs.read']
        }
      }, async () => ({ content: 'ok', success: true }));
      
      const context = executor.createContext({
        sessionId: 'test',
        runId: 'run1',
        toolCallId: 'call1',
        permissions: ['fs.read', 'fs.write']
      });
      
      const result = await executor.execute('allowed_tool', {}, context);
      
      expect(result.success).toBe(true);
    });
    
    it('should support wildcard permissions', async () => {
      executor.register({
        name: 'fs_tool',
        description: 'Filesystem tool',
        parameters: { type: 'object', properties: {} },
        metadata: {
          permissions: ['fs.read', 'fs.write']
        }
      }, async () => ({ content: 'ok', success: true }));
      
      const context = executor.createContext({
        sessionId: 'test',
        runId: 'run1',
        toolCallId: 'call1',
        permissions: ['fs.*']  // Wildcard covers fs.read and fs.write
      });
      
      const result = await executor.execute('fs_tool', {}, context);
      
      expect(result.success).toBe(true);
    });
  });
  
  // ========================================================================
  // Result Compression
  // ========================================================================
  
  describe('Result Compression', () => {
    it('should compress large results', async () => {
      const largeContent = 'x'.repeat(2000);
      
      executor.register({
        name: 'large_output',
        description: 'Produces large output',
        parameters: { type: 'object', properties: {} }
      }, async () => ({ content: largeContent, success: true }));
      
      const context = executor.createContext({
        sessionId: 'test',
        runId: 'run1',
        toolCallId: 'call1'
      });
      
      const result = await executor.execute('large_output', {}, context);
      
      expect(result.success).toBe(true);
      expect(result.content.length).toBeLessThan(largeContent.length);
      expect(result.metadata?.truncated).toBe(true);
      expect(result.metadata?.originalLength).toBe(largeContent.length);
    });
  });
  
  // ========================================================================
  // Concurrent Execution
  // ========================================================================
  
  describe('Concurrent Execution', () => {
    it('should execute multiple tools in parallel', async () => {
      const delays: number[] = [];
      
      for (let i = 0; i < 5; i++) {
        executor.register({
          name: `tool_${i}`,
          description: `Tool ${i}`,
          parameters: { type: 'object', properties: {} }
        }, async () => {
          const delay = Math.random() * 100;
          delays.push(delay);
          await new Promise(resolve => setTimeout(resolve, delay));
          return { content: `result_${i}`, success: true };
        });
      }
      
      const calls = Array.from({ length: 5 }, (_, i) => ({
        id: `call_${i}`,
        name: `tool_${i}`,
        params: {}
      }));
      
      const context = executor.createContext({
        sessionId: 'test',
        runId: 'run1',
        toolCallId: 'batch'
      });
      
      const startTime = Date.now();
      const results = await executor.executeMany(calls, context);
      const duration = Date.now() - startTime;
      
      // Should be faster than sequential
      const sequentialTime = delays.reduce((sum, d) => sum + d, 0);
      expect(duration).toBeLessThan(sequentialTime * 0.8);
      
      expect(results.size).toBe(5);
      for (let i = 0; i < 5; i++) {
        const result = results.get(`call_${i}`);
        expect(result).toBeTruthy();
        expect(result!.success).toBe(true);
      }
    });
    
    it('should handle errors in concurrent execution', async () => {
      executor.register({
        name: 'success_tool',
        description: 'Succeeds',
        parameters: { type: 'object', properties: {} }
      }, async () => ({ content: 'ok', success: true }));
      
      executor.register({
        name: 'fail_tool',
        description: 'Fails',
        parameters: { type: 'object', properties: {} }
      }, async () => {
        throw new Error('Failed');
      });
      
      const calls = [
        { id: 'call_1', name: 'success_tool', params: {} },
        { id: 'call_2', name: 'fail_tool', params: {} },
        { id: 'call_3', name: 'success_tool', params: {} }
      ];
      
      const context = executor.createContext({
        sessionId: 'test',
        runId: 'run1',
        toolCallId: 'batch'
      });
      
      const results = await executor.executeMany(calls, context);
      
      expect(results.size).toBe(3);
      expect(results.get('call_1')!.success).toBe(true);
      expect(results.get('call_2')!.success).toBe(false);
      expect(results.get('call_3')!.success).toBe(true);
    });
  });
  
  // ========================================================================
  // Nested Tool Calls
  // ========================================================================
  
  describe('Nested Tool Invocation', () => {
    it('should allow tool to call another tool', async () => {
      executor.register({
        name: 'add',
        description: 'Add two numbers',
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
        success: true,
        data: (params.a as number) + (params.b as number)
      }));
      
      executor.register({
        name: 'multiply',
        description: 'Multiply result of addition',
        parameters: {
          type: 'object',
          properties: {
            a: { type: 'number' },
            b: { type: 'number' },
            factor: { type: 'number' }
          },
          required: ['a', 'b', 'factor']
        }
      }, async (params, context) => {
        // Call add tool
        const addResult = await context.invokeTool('add', {
          a: params.a,
          b: params.b
        });
        
        if (!addResult.success) {
          return addResult;
        }
        
        const sum = addResult.data as number;
        const result = sum * (params.factor as number);
        
        return {
          content: String(result),
          success: true,
          data: result
        };
      });
      
      const context = executor.createContext({
        sessionId: 'test',
        runId: 'run1',
        toolCallId: 'call1'
      });
      
      const result = await executor.execute('multiply', {
        a: 3,
        b: 4,
        factor: 5
      }, context);
      
      expect(result.success).toBe(true);
      expect(result.data).toBe(35); // (3 + 4) * 5
    });
    
    it('should prevent infinite recursion', async () => {
      executor.register({
        name: 'recursive',
        description: 'Calls itself',
        parameters: { type: 'object', properties: {} }
      }, async (params, context) => {
        return await context.invokeTool('recursive', {});
      });
      
      const context = executor.createContext({
        sessionId: 'test',
        runId: 'run1',
        toolCallId: 'call1'
      });
      
      const result = await executor.execute('recursive', {}, context);
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MAX_DEPTH_EXCEEDED');
    });
  });
});
