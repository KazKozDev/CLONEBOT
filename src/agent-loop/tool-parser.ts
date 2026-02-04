/**
 * Tool Call Parser
 * 
 * Parses and validates tool calls from model responses.
 */

import type { ToolCall, ModelResponse } from './types';

// ============================================================================
// Parser
// ============================================================================

export class ToolCallParser {
  /**
   * Extract tool calls from model response
   */
  parse(response: ModelResponse): ToolCall[] {
    if (!response.toolCalls || response.toolCalls.length === 0) {
      return [];
    }
    
    return response.toolCalls.map(tc => ({
      id: tc.id,
      name: tc.name,
      arguments: tc.arguments,
      status: 'pending' as const,
    }));
  }
  
  /**
   * Validate tool calls
   */
  validate(toolCalls: ToolCall[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    for (const tc of toolCalls) {
      // Check ID
      if (!tc.id || tc.id.trim() === '') {
        errors.push(`Tool call missing ID`);
      }
      
      // Check name
      if (!tc.name || tc.name.trim() === '') {
        errors.push(`Tool call ${tc.id} missing name`);
      }
      
      // Check arguments
      if (typeof tc.arguments !== 'object' || tc.arguments === null) {
        errors.push(`Tool call ${tc.id} has invalid arguments`);
      }
    }
    
    // Check for duplicate IDs
    const ids = toolCalls.map(tc => tc.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      errors.push('Duplicate tool call IDs detected');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
  
  /**
   * Check if response has tool calls
   */
  hasToolCalls(response: ModelResponse): boolean {
    return Boolean(response.toolCalls && response.toolCalls.length > 0);
  }
}
