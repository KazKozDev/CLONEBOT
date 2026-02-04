/**
 * Tool Collector
 * 
 * Collects and filters tools for context assembly.
 */

import type { ToolDefinition, ToolCollectionOptions, Skill, ToolExecutor } from './types';

// ============================================================================
// Tool Collector
// ============================================================================

export class ToolCollector {
  private toolExecutor: ToolExecutor;
  
  constructor(toolExecutor: ToolExecutor) {
    this.toolExecutor = toolExecutor;
  }
  
  /**
   * Collect tools from executor
   */
  async collectFromExecutor(options: ToolCollectionOptions = {}): Promise<ToolDefinition[]> {
    // Get all tools from executor
    let tools = this.toolExecutor.getForModel({
      sandboxMode: options.sandboxMode,
    });
    
    // Apply permissions filter
    if (options.permissions && options.permissions.length > 0) {
      tools = this.filterByPermissions(tools, options.permissions);
    }
    
    // Apply sandbox allowlist/denylist
    if (options.sandboxMode) {
      if (options.sandboxAllowlist && options.sandboxAllowlist.length > 0) {
        tools = tools.filter(t => options.sandboxAllowlist!.includes(t.name));
      }
      
      if (options.sandboxDenylist && options.sandboxDenylist.length > 0) {
        tools = tools.filter(t => !options.sandboxDenylist!.includes(t.name));
      }
    }
    
    // Apply exclude filter
    if (options.exclude && options.exclude.length > 0) {
      tools = tools.filter(t => !options.exclude!.includes(t.name));
    }
    
    return tools;
  }
  
  /**
   * Collect tools from skills
   */
  async collectFromSkills(skills: Skill[]): Promise<ToolDefinition[]> {
    const allTools: ToolDefinition[] = [];
    
    for (const skill of skills) {
      if (skill.tools) {
        allTools.push(...skill.tools);
      }
    }
    
    return allTools;
  }
  
  /**
   * Collect additional tools
   */
  async collectAdditional(tools: ToolDefinition[] = []): Promise<ToolDefinition[]> {
    return [...tools];
  }
  
  /**
   * Merge tools from multiple sources
   */
  mergeTools(...toolSets: ToolDefinition[][]): ToolDefinition[] {
    const merged: ToolDefinition[] = [];
    const seen = new Set<string>();
    
    for (const toolSet of toolSets) {
      for (const tool of toolSet) {
        if (!seen.has(tool.name)) {
          merged.push(tool);
          seen.add(tool.name);
        }
      }
    }
    
    return merged;
  }
  
  /**
   * Filter tools by permissions
   */
  private filterByPermissions(
    tools: ToolDefinition[],
    permissions: string[]
  ): ToolDefinition[] {
    return tools.filter(tool => {
      const requiredPerms = tool.metadata?.permissions || [];
      
      if (requiredPerms.length === 0) {
        return true; // No permissions required
      }
      
      // Check if all required permissions are granted
      return requiredPerms.every(required =>
        permissions.some(granted => this.matchesPermission(required, granted))
      );
    });
  }
  
  /**
   * Check if permission matches (supports wildcards)
   */
  private matchesPermission(required: string, granted: string): boolean {
    // Exact match
    if (required === granted) {
      return true;
    }
    
    // Wildcard match: granted = "fs.*" matches required = "fs.read"
    if (granted.endsWith('.*')) {
      const prefix = granted.slice(0, -2);
      return required.startsWith(prefix + '.');
    }
    
    // Universal wildcard
    if (granted === '*') {
      return true;
    }
    
    return false;
  }
  
  /**
   * Remove disabled tools
   */
  removeDisabled(tools: ToolDefinition[], disabled: string[]): ToolDefinition[] {
    return tools.filter(t => !disabled.includes(t.name));
  }
  
  /**
   * Sort tools by name
   */
  sortByName(tools: ToolDefinition[]): ToolDefinition[] {
    return [...tools].sort((a, b) => a.name.localeCompare(b.name));
  }
  
  /**
   * Sort tools by category
   */
  sortByCategory(tools: ToolDefinition[]): ToolDefinition[] {
    return [...tools].sort((a, b) => {
      const catA = a.metadata?.category || 'other';
      const catB = b.metadata?.category || 'other';
      
      if (catA !== catB) {
        return catA.localeCompare(catB);
      }
      
      return a.name.localeCompare(b.name);
    });
  }
  
  /**
   * Get tool names
   */
  getToolNames(tools: ToolDefinition[]): string[] {
    return tools.map(t => t.name);
  }
  
  /**
   * Get tool categories
   */
  getCategories(tools: ToolDefinition[]): string[] {
    const categories = new Set<string>();
    
    for (const tool of tools) {
      const category = tool.metadata?.category || 'other';
      categories.add(category);
    }
    
    return Array.from(categories).sort();
  }
  
  /**
   * Group tools by category
   */
  groupByCategory(tools: ToolDefinition[]): Record<string, ToolDefinition[]> {
    const groups: Record<string, ToolDefinition[]> = {};
    
    for (const tool of tools) {
      const category = tool.metadata?.category || 'other';
      
      if (!groups[category]) {
        groups[category] = [];
      }
      
      groups[category].push(tool);
    }
    
    return groups;
  }
  
  /**
   * Collect all tools for context assembly
   */
  async collect(
    skills: Skill[],
    options: ToolCollectionOptions = {}
  ): Promise<ToolDefinition[]> {
    // Collect from all sources
    const executorTools = await this.collectFromExecutor(options);
    const skillTools = await this.collectFromSkills(skills);
    
    // Merge tools
    let allTools = this.mergeTools(executorTools, skillTools);
    
    // Remove disabled tools
    if (options.exclude && options.exclude.length > 0) {
      allTools = this.removeDisabled(allTools, options.exclude);
    }
    
    // Sort by name
    allTools = this.sortByName(allTools);
    
    return allTools;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create tool collector
 */
export function createToolCollector(toolExecutor: ToolExecutor): ToolCollector {
  return new ToolCollector(toolExecutor);
}
