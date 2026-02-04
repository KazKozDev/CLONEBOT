/**
 * Tool Registry
 * 
 * Manages registration, storage, and discovery of tools.
 */

import type {
  ToolDefinition,
  ToolHandler,
  RegisteredTool,
  ListOptions,
  ModelToolsOptions,
  ToolIntrospection,
  ToolRegistryStats,
  ToolStats
} from './types';
import { ToolExecutorError } from './types';
import { validateToolDefinition } from './validation/definition-validator';

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();
  private categoryIndex = new Map<string, Set<string>>();
  
  /**
   * Register a new tool
   */
  register(definition: ToolDefinition, handler: ToolHandler): void {
    // Validate definition
    const validation = validateToolDefinition(definition);
    if (!validation.valid) {
      const errorMessages = validation.errors.map(e => `${e.path}: ${e.message}`).join('; ');
      throw new ToolExecutorError(
        `Invalid tool definition: ${errorMessages}`,
        'INVALID_DEFINITION',
        { errors: validation.errors }
      );
    }
    
    // Check for duplicate
    if (this.tools.has(definition.name)) {
      throw new ToolExecutorError(
        `Tool already registered: ${definition.name}`,
        'DUPLICATE_TOOL',
        { name: definition.name }
      );
    }
    
    // Create registered tool
    const registered: RegisteredTool = {
      definition,
      handler,
      registered: new Date(),
      executionCount: 0,
      totalDuration: 0,
      errorCount: 0
    };
    
    // Store tool
    this.tools.set(definition.name, registered);
    
    // Update category index
    const category = definition.metadata?.category || 'uncategorized';
    if (!this.categoryIndex.has(category)) {
      this.categoryIndex.set(category, new Set());
    }
    this.categoryIndex.get(category)!.add(definition.name);
  }
  
  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) {
      return false;
    }
    
    // Remove from category index
    const category = tool.definition.metadata?.category || 'uncategorized';
    this.categoryIndex.get(category)?.delete(name);
    
    // Remove tool
    this.tools.delete(name);
    return true;
  }
  
  /**
   * Get a registered tool
   */
  get(name: string): RegisteredTool | null {
    return this.tools.get(name) || null;
  }
  
  /**
   * Check if tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }
  
  /**
   * List tool definitions with filtering
   */
  list(options: ListOptions = {}): ToolDefinition[] {
    let tools = Array.from(this.tools.values());
    
    // Filter by category
    if (options.category) {
      tools = tools.filter(t => t.definition.metadata?.category === options.category);
    }
    
    // Filter by permissions
    if (options.permissions && options.permissions.length > 0) {
      tools = tools.filter(t => {
        const toolPerms = t.definition.metadata?.permissions || [];
        return options.permissions!.some(perm => toolPerms.includes(perm));
      });
    }
    
    // Exclude by permissions
    if (options.excludePermissions && options.excludePermissions.length > 0) {
      tools = tools.filter(t => {
        const toolPerms = t.definition.metadata?.permissions || [];
        return !options.excludePermissions!.some(perm => toolPerms.includes(perm));
      });
    }
    
    // Filter dangerous tools
    if (!options.includeDangerous) {
      tools = tools.filter(t => !t.definition.metadata?.dangerous);
    }
    
    // Search by name/description
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      tools = tools.filter(t => 
        t.definition.name.toLowerCase().includes(searchLower) ||
        t.definition.description.toLowerCase().includes(searchLower)
      );
    }
    
    return tools.map(t => t.definition);
  }
  
  /**
   * Get tools formatted for the model
   */
  getForModel(options: ModelToolsOptions = {}): ToolDefinition[] {
    let definitions = this.list(options);
    
    // Apply sandbox filtering
    if (options.sandboxMode) {
      // In sandbox mode, only return safe tools
      definitions = definitions.filter(def => {
        const permissions = def.metadata?.permissions || [];
        const dangerous = def.metadata?.dangerous || false;
        
        // Exclude dangerous tools
        if (dangerous) return false;
        
        // Exclude tools with dangerous permissions
        const dangerousPerms = ['process.exec', 'process.kill', 'system.dangerous', 'fs.delete'];
        return !permissions.some(perm => dangerousPerms.includes(perm));
      });
    }
    
    return definitions;
  }
  
  /**
   * Get all categories
   */
  categories(): string[] {
    return Array.from(this.categoryIndex.keys());
  }
  
  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    this.categoryIndex.clear();
  }
  
  /**
   * Get introspection data for a tool
   */
  introspect(name: string): ToolIntrospection | null {
    const tool = this.tools.get(name);
    if (!tool) {
      return null;
    }
    
    return {
      definition: tool.definition,
      registered: tool.registered,
      executionCount: tool.executionCount,
      averageDuration: tool.executionCount > 0 
        ? tool.totalDuration / tool.executionCount 
        : 0,
      lastError: tool.lastError
    };
  }
  
  /**
   * Get registry statistics
   */
  getStats(): ToolRegistryStats {
    const tools = Array.from(this.tools.values());
    
    // Calculate categories
    const categories: Record<string, number> = {};
    for (const [category, toolSet] of this.categoryIndex) {
      categories[category] = toolSet.size;
    }
    
    // Find most used tools
    const mostUsed = tools
      .map(t => ({
        name: t.definition.name,
        executionCount: t.executionCount,
        errorCount: t.errorCount,
        totalDuration: t.totalDuration,
        averageDuration: t.executionCount > 0 ? t.totalDuration / t.executionCount : 0,
        lastError: t.lastError
      }))
      .sort((a, b) => b.executionCount - a.executionCount)
      .slice(0, 10);
    
    // Collect recent errors
    const recentErrors = tools
      .filter(t => t.lastError)
      .map(t => ({
        toolName: t.definition.name,
        message: t.lastError!.message,
        timestamp: t.lastError!.timestamp
      }))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);
    
    return {
      totalTools: this.tools.size,
      totalExecutions: tools.reduce((sum, t) => sum + t.executionCount, 0),
      totalErrors: tools.reduce((sum, t) => sum + t.errorCount, 0),
      categories,
      mostUsed,
      recentErrors
    };
  }
  
  /**
   * Update tool stats after execution
   */
  recordExecution(name: string, duration: number, success: boolean, error?: string): void {
    const tool = this.tools.get(name);
    if (!tool) {
      return;
    }
    
    tool.executionCount++;
    tool.totalDuration += duration;
    
    if (!success) {
      tool.errorCount++;
      tool.lastError = {
        message: error || 'Unknown error',
        timestamp: new Date()
      };
    }
  }
}
