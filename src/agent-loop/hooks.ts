/**
 * Hooks System
 * 
 * Extensibility through lifecycle hooks.
 */

import type { HookHandler, HookName, RunContext, ToolResult, ModelResponse } from './types';

// ============================================================================
// Hook Context
// ============================================================================

export type HookContext =
  | { hook: 'beforeRun'; runId: string; sessionId: string }
  | { hook: 'afterContextAssembly'; context: any }
  | { hook: 'beforeModelCall'; context: any }
  | { hook: 'afterModelCall'; response: ModelResponse }
  | { hook: 'beforeToolExecution'; toolName: string; arguments: Record<string, unknown> }
  | { hook: 'afterToolExecution'; toolName: string; result: ToolResult }
  | { hook: 'afterRun'; context: RunContext }
  | { hook: 'onError'; error: Error; phase: string };

// ============================================================================
// Hooks Manager
// ============================================================================

export class HooksManager {
  private hooks: Map<HookName, HookHandler[]> = new Map();
  
  /**
   * Register hook
   */
  on(name: HookName, handler: HookHandler): void {
    if (!this.hooks.has(name)) {
      this.hooks.set(name, []);
    }
    this.hooks.get(name)!.push(handler);
  }
  
  /**
   * Unregister hook
   */
  off(name: HookName, handler: HookHandler): void {
    const handlers = this.hooks.get(name);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }
  
  /**
   * Execute hooks
   */
  async execute(name: HookName, context: any): Promise<void> {
    const handlers = this.hooks.get(name);
    if (!handlers || handlers.length === 0) {
      return;
    }
    
    // Execute all hooks in sequence
    for (const handler of handlers) {
      try {
        await handler(context);
      } catch (error) {
        console.error(`Hook ${name} failed:`, error);
        // Continue with other hooks
      }
    }
  }
  
  /**
   * Clear all hooks
   */
  clear(): void {
    this.hooks.clear();
  }
  
  /**
   * Get registered hooks
   */
  getHooks(name: HookName): HookHandler[] {
    return this.hooks.get(name) ?? [];
  }
}
