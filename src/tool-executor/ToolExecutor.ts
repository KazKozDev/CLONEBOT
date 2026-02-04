/**
 * Tool Executor
 * 
 * Main facade class that orchestrates tool registration and execution.
 */

import type {
  ToolDefinition,
  ToolHandler,
  ToolResult,
  ToolCall,
  ToolExecutorConfig,
  ListOptions,
  ModelToolsOptions,
  ValidationResult,
  ContextOptions,
  ExecutionContext,
  BeforeHook,
  AfterHook,
  ErrorHook,
  ToolIntrospection,
  ToolRegistryStats,
  RegisteredTool
} from './types';

import { ToolRegistry } from './registry';
import { HookManager } from './hooks/hook-manager';
import { createStandardHooks } from './hooks/builtin-hooks';
import { executeTool, executeMany } from './executor';
import { createExecutionContext, createChildContext } from './context';
import { ToolNotFoundError } from './types';
import { validateParameters } from './validation/schema-validator';
import { RateLimiter, AuditLogger } from '../security';

const DEFAULT_CONFIG: ToolExecutorConfig = {
  defaultTimeout: 30000,
  maxTimeout: 600000,
  maxConcurrent: 10,
  maxResultLength: 50000,
  truncationStrategy: 'smart',
  defaultSandboxMode: false,
  sandboxAllowlist: [],
  sandboxDenylist: [],
  requireConfirmationFor: [],
  enableCaching: false,
  cacheMaxAge: 3600000
};

export class ToolExecutor {
  private registry: ToolRegistry;
  private hooks: HookManager;
  private config: ToolExecutorConfig;
  private nestedCallDepth = new Map<string, number>();
  private readonly maxNestedDepth = 10;
  private rateLimiter: RateLimiter | null = null;
  private auditLogger: AuditLogger | null = null;
  
  constructor(config?: Partial<ToolExecutorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registry = new ToolRegistry();
    this.hooks = new HookManager();
    
    // Add standard hooks
    const standardHooks = createStandardHooks(this.config);
    standardHooks.before.forEach(hook => this.hooks.addBeforeHook(hook));
    standardHooks.after.forEach(hook => this.hooks.addAfterHook(hook));
    standardHooks.error.forEach(hook => this.hooks.addErrorHook(hook));
  }

  /**
   * Включает Rate Limiting для инструментов
   */
  enableRateLimiting(limiter: RateLimiter): void {
    this.rateLimiter = limiter;
  }

  /**
   * Включает аудит для инструментов
   */
  enableAudit(logger: AuditLogger): void {
    this.auditLogger = logger;
  }
  
  // ========================================================================
  // Registry Operations
  // ========================================================================
  
  /**
   * Register a new tool
   */
  register(definition: ToolDefinition, handler: ToolHandler): void {
    this.registry.register(definition, handler);
  }
  
  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    return this.registry.unregister(name);
  }
  
  /**
   * Get a registered tool
   */
  get(name: string): RegisteredTool | null {
    return this.registry.get(name);
  }
  
  /**
   * Check if tool exists
   */
  has(name: string): boolean {
    return this.registry.has(name);
  }
  
  /**
   * List tool definitions
   */
  list(options?: ListOptions): ToolDefinition[] {
    return this.registry.list(options);
  }
  
  /**
   * Get tools for model
   */
  getForModel(options?: ModelToolsOptions): ToolDefinition[] {
    return this.registry.getForModel(options);
  }
  
  /**
   * Get all categories
   */
  categories(): string[] {
    return this.registry.categories();
  }
  
  // ========================================================================
  // Execution
  // ========================================================================
  
  /**
   * Execute a tool
   */
  async execute(
    name: string,
    params: unknown,
    context: ExecutionContext
  ): Promise<ToolResult> {
    // Rate Limiting
    if (this.rateLimiter) {
      const rateLimitResult = this.rateLimiter.check(context.sessionId || 'default');
      if (!rateLimitResult.allowed) {
        await this.auditLogger?.warn('rate.limit', `Rate limit exceeded for tool: ${name}`, {
          sessionId: context.sessionId,
          toolName: name,
          retryAfter: rateLimitResult.retryAfter,
        });

        return {
          content: `Error: Rate limit exceeded. Try again in ${Math.ceil((rateLimitResult.retryAfter || 0) / 1000)}s`,
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Rate limit exceeded',
            details: { retryAfter: rateLimitResult.retryAfter },
          },
        };
      }
    }

    // Audit Log - Start
    await this.auditLogger?.info('tool.execute', `Executing tool: ${name}`, {
      sessionId: context.sessionId,
      toolName: name,
      params,
    });

    // Check nested depth
    const currentDepth = this.nestedCallDepth.get(context.runId) || 0;
    if (currentDepth >= this.maxNestedDepth) {
      await this.auditLogger?.error('tool.error', `Max depth exceeded for tool: ${name}`, {
        sessionId: context.sessionId,
        toolName: name,
        maxDepth: this.maxNestedDepth,
      });

      return {
        content: `Error: Maximum nested tool call depth (${this.maxNestedDepth}) exceeded`,
        success: false,
        error: {
          code: 'MAX_DEPTH_EXCEEDED',
          message: `Maximum nested tool call depth exceeded`,
          details: { maxDepth: this.maxNestedDepth, currentDepth }
        }
      };
    }
    
    // Increment depth
    this.nestedCallDepth.set(context.runId, currentDepth + 1);
    
    try {
      // Create context with invokeTool support
      const contextWithInvoke: ExecutionContext = {
        ...context,
        invokeTool: async (toolName: string, toolParams: unknown) => {
          // Create child context
          const remainingTimeout = context.timeout - (Date.now() - Date.now()); // Simplified
          const childContext = createChildContext(
            context,
            `${context.toolCallId}.${toolName}`,
            remainingTimeout
          );
          
          return this.execute(toolName, toolParams as Record<string, unknown>, childContext);
        }
      };
      
      const result = await executeTool(
        this.registry,
        this.hooks,
        name,
        params as Record<string, unknown>,
        contextWithInvoke,
        this.config
      );

      // Audit Log - Success
      await this.auditLogger?.info('tool.execute', `Tool executed successfully: ${name}`, {
        sessionId: context.sessionId,
        toolName: name,
        success: result.success,
      });

      return result;
    } catch (error: any) {
      if (error instanceof ToolNotFoundError) {
        return {
          content: `Error: Tool not found: ${name}`,
          success: false,
          error: {
            code: 'TOOL_NOT_FOUND',
            message: error.message,
          },
        };
      }
      // Audit Log - Error
      await this.auditLogger?.error('tool.error', `Tool execution failed: ${name}`, {
        sessionId: context.sessionId,
        toolName: name,
        error: error.message,
      });
      throw error;
    } finally {
      // Decrement depth
      const depth = this.nestedCallDepth.get(context.runId) || 1;
      this.nestedCallDepth.set(context.runId, depth - 1);
      
      // Clean up if back to 0
      if (depth - 1 === 0) {
        this.nestedCallDepth.delete(context.runId);
      }
    }
  }
  
  /**
   * Execute multiple tools concurrently
   */
  async executeMany(
    calls: ToolCall[],
    context: ExecutionContext
  ): Promise<Map<string, ToolResult>> {
    return executeMany(
      this.registry,
      this.hooks,
      calls,
      context,
      this.config
    );
  }
  
  /**
   * Validate parameters without executing
   */
  validate(name: string, params: unknown): ValidationResult {
    const tool = this.registry.get(name);
    if (!tool) {
      return {
        valid: false,
        errors: [{
          path: 'tool',
          message: `Tool not found: ${name}`,
          code: 'TOOL_NOT_FOUND'
        }]
      };
    }
    
    return validateParameters(params, tool.definition.parameters);
  }
  
  // ========================================================================
  // Hooks
  // ========================================================================
  
  /**
   * Add a before hook
   */
  addBeforeHook(hook: BeforeHook): void {
    this.hooks.addBeforeHook(hook);
  }
  
  /**
   * Remove a before hook
   */
  removeBeforeHook(name: string): void {
    this.hooks.removeBeforeHook(name);
  }
  
  /**
   * Add an after hook
   */
  addAfterHook(hook: AfterHook): void {
    this.hooks.addAfterHook(hook);
  }
  
  /**
   * Remove an after hook
   */
  removeAfterHook(name: string): void {
    this.hooks.removeAfterHook(name);
  }
  
  /**
   * Add an error hook
   */
  addErrorHook(hook: ErrorHook): void {
    this.hooks.addErrorHook(hook);
  }
  
  /**
   * Remove an error hook
   */
  removeErrorHook(name: string): void {
    this.hooks.removeErrorHook(name);
  }
  
  // ========================================================================
  // Configuration
  // ========================================================================
  
  /**
   * Update configuration
   */
  configure(config: Partial<ToolExecutorConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Get current configuration
   */
  getConfig(): ToolExecutorConfig {
    return { ...this.config };
  }
  
  // ========================================================================
  // Utilities
  // ========================================================================
  
  /**
   * Create an execution context
   */
  createContext(options: ContextOptions): ExecutionContext {
    return createExecutionContext(options);
  }
  
  /**
   * Get tool introspection data
   */
  introspect(name: string): ToolIntrospection | null {
    return this.registry.introspect(name);
  }
  
  /**
   * Get registry statistics
   */
  getStats(): ToolRegistryStats {
    return this.registry.getStats();
  }
  
  /**
   * Clear all tools and hooks
   */
  clear(): void {
    this.registry.clear();
    this.hooks.clear();
    this.nestedCallDepth.clear();
  }
}
