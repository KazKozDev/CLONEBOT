/**
 * Hook Manager
 * 
 * Manages and executes before/after/error hooks.
 */

import type {
  BeforeHook,
  AfterHook,
  ErrorHook,
  BeforeHookContext,
  AfterHookContext,
  ErrorHookContext,
  BeforeHookResult,
  ToolResult
} from '../types';

export class HookManager {
  private beforeHooks: BeforeHook[] = [];
  private afterHooks: AfterHook[] = [];
  private errorHooks: ErrorHook[] = [];
  
  /**
   * Add a before hook
   */
  addBeforeHook(hook: BeforeHook): void {
    this.beforeHooks.push(hook);
    this.beforeHooks.sort((a, b) => b.priority - a.priority); // Higher priority first
  }
  
  /**
   * Remove a before hook
   */
  removeBeforeHook(name: string): boolean {
    const index = this.beforeHooks.findIndex(h => h.name === name);
    if (index === -1) return false;
    this.beforeHooks.splice(index, 1);
    return true;
  }
  
  /**
   * Add an after hook
   */
  addAfterHook(hook: AfterHook): void {
    this.afterHooks.push(hook);
    this.afterHooks.sort((a, b) => b.priority - a.priority);
  }
  
  /**
   * Remove an after hook
   */
  removeAfterHook(name: string): boolean {
    const index = this.afterHooks.findIndex(h => h.name === name);
    if (index === -1) return false;
    this.afterHooks.splice(index, 1);
    return true;
  }
  
  /**
   * Add an error hook
   */
  addErrorHook(hook: ErrorHook): void {
    this.errorHooks.push(hook);
    this.errorHooks.sort((a, b) => b.priority - a.priority);
  }
  
  /**
   * Remove an error hook
   */
  removeErrorHook(name: string): boolean {
    const index = this.errorHooks.findIndex(h => h.name === name);
    if (index === -1) return false;
    this.errorHooks.splice(index, 1);
    return true;
  }
  
  /**
   * Execute before hooks
   */
  async executeBeforeHooks(context: BeforeHookContext): Promise<BeforeHookResult> {
    let currentParams = context.params;
    
    for (const hook of this.beforeHooks) {
      try {
        const result = await Promise.resolve(hook.handler({
          ...context,
          params: currentParams
        }));
        
        if (!result.proceed) {
          return result;
        }
        
        // Update params if hook modified them
        if (result.params) {
          currentParams = result.params;
        }
      } catch (error) {
        // Hook threw - block execution
        return {
          proceed: false,
          reason: `Before hook "${hook.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
          error: {
            content: `Hook error: ${error instanceof Error ? error.message : String(error)}`,
            success: false,
            error: {
              code: 'HOOK_ERROR',
              message: error instanceof Error ? error.message : String(error),
              details: { hook: hook.name, phase: 'before' }
            }
          }
        };
      }
    }
    
    return {
      proceed: true,
      params: currentParams
    };
  }
  
  /**
   * Execute after hooks
   */
  async executeAfterHooks(context: AfterHookContext): Promise<ToolResult> {
    let currentResult = context.result;
    
    for (const hook of this.afterHooks) {
      try {
        currentResult = await Promise.resolve(hook.handler({
          ...context,
          result: currentResult
        }));
      } catch (error) {
        // Hook threw - log but continue
        context.executionContext.log('error', `After hook "${hook.name}" failed`, {
          error: error instanceof Error ? error.message : String(error),
          hook: hook.name
        });
        // Don't modify result
      }
    }
    
    return currentResult;
  }
  
  /**
   * Execute error hooks
   */
  async executeErrorHooks(context: ErrorHookContext): Promise<ToolResult | null> {
    for (const hook of this.errorHooks) {
      try {
        const result = await Promise.resolve(hook.handler(context));
        
        // If hook returns a result, use it as fallback
        if (result) {
          return result;
        }
      } catch (error) {
        // Hook threw - log but continue to next hook
        context.executionContext.log('error', `Error hook "${hook.name}" failed`, {
          error: error instanceof Error ? error.message : String(error),
          hook: hook.name
        });
      }
    }
    
    // No hook provided fallback
    return null;
  }
  
  /**
   * Clear all hooks
   */
  clear(): void {
    this.beforeHooks = [];
    this.afterHooks = [];
    this.errorHooks = [];
  }
  
  /**
   * Get hook counts
   */
  getCounts(): { before: number; after: number; error: number } {
    return {
      before: this.beforeHooks.length,
      after: this.afterHooks.length,
      error: this.errorHooks.length
    };
  }
}
