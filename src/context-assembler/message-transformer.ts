/**
 * Message Transformer
 * 
 * Transforms messages from session format to model format.
 */

import type { SessionMessage, ModelMessage, ContentBlock, ToolUseBlock, ToolResultBlock } from './types';

// ============================================================================
// Message Transformer
// ============================================================================

export class MessageTransformer {
  /**
   * Transform session message to model message
   */
  transform(message: SessionMessage): ModelMessage | null {
    const role = this.getModelRole(message);

    if (!role) {
      return null; // Skip messages without model role
    }

    return {
      role,
      content: (message.content ?? '') as string | ContentBlock[],
    };
  }

  /**
   * Get model role from session message
   */
  private getModelRole(message: SessionMessage): 'system' | 'user' | 'assistant' | null {
    // Check metadata first
    if (message.metadata?.modelRole) {
      return message.metadata.modelRole;
    }

    // Map session type to model role
    switch (message.type) {
      case 'system':
        return 'system';

      case 'user':
        return 'user';

      case 'assistant':
      case 'tool_call':
      case 'compaction':
        return 'assistant';

      case 'tool_result':
        return 'user'; // Tool results come from user perspective

      default:
        return null; // Skip unknown types
    }
  }

  /**
   * Transform array of session messages to model messages
   */
  transformMany(messages: SessionMessage[]): ModelMessage[] {
    return messages
      .map(m => this.transform(m))
      .filter((m): m is ModelMessage => m !== null);
  }

  /**
   * Merge consecutive messages with same role
   */
  mergeConsecutive(messages: ModelMessage[]): ModelMessage[] {
    if (messages.length === 0) {
      return [];
    }

    const merged: ModelMessage[] = [];
    let current = { ...messages[0] };

    for (let i = 1; i < messages.length; i++) {
      const next = messages[i];

      if (next.role === current.role) {
        // Same role, merge content
        current.content = this.mergeContent(current.content, next.content);
      } else {
        // Different role, push current and start new
        merged.push(current);
        current = { ...next };
      }
    }

    // Push last message
    merged.push(current);

    return merged;
  }

  /**
   * Merge two content values
   */
  private mergeContent(
    a: string | ContentBlock[],
    b: string | ContentBlock[]
  ): string | ContentBlock[] {
    // Both strings
    if (typeof a === 'string' && typeof b === 'string') {
      return `${a}\n\n${b}`;
    }

    // Convert to blocks if needed
    const aBlocks = typeof a === 'string' ? [{ type: 'text' as const, text: a }] : a;
    const bBlocks = typeof b === 'string' ? [{ type: 'text' as const, text: b }] : b;

    return [...aBlocks, ...bBlocks];
  }

  /**
   * Ensure alternating user/assistant pattern
   */
  ensureAlternating(messages: ModelMessage[]): ModelMessage[] {
    if (messages.length === 0) {
      return [];
    }

    const result: ModelMessage[] = [];

    for (const message of messages) {
      // Skip system messages in alternating check
      if (message.role === 'system') {
        result.push(message);
        continue;
      }

      const lastNonSystem = result
        .slice()
        .reverse()
        .find(m => m.role !== 'system');

      if (!lastNonSystem || lastNonSystem.role !== message.role) {
        // Different role or first message, just add it
        result.push(message);
      } else {
        // Same role as last, merge them
        const merged = this.mergeContent(lastNonSystem.content, message.content);
        lastNonSystem.content = merged;
      }
    }

    return result;
  }

  /**
   * Extract tool calls from message content
   */
  extractToolCalls(message: ModelMessage): ToolUseBlock[] {
    if (typeof message.content === 'string') {
      return [];
    }

    return message.content.filter(
      (block): block is ToolUseBlock => block.type === 'tool_use'
    );
  }

  /**
   * Extract tool results from message content
   */
  extractToolResults(message: ModelMessage): ToolResultBlock[] {
    if (typeof message.content === 'string') {
      return [];
    }

    return message.content.filter(
      (block): block is ToolResultBlock => block.type === 'tool_result'
    );
  }

  /**
   * Check if message contains tool calls
   */
  hasToolCalls(message: ModelMessage): boolean {
    return this.extractToolCalls(message).length > 0;
  }

  /**
   * Check if message contains tool results
   */
  hasToolResults(message: ModelMessage): boolean {
    return this.extractToolResults(message).length > 0;
  }

  /**
   * Get tool call IDs from message
   */
  getToolCallIds(message: ModelMessage): string[] {
    return this.extractToolCalls(message).map(tc => tc.id);
  }

  /**
   * Find corresponding tool result message
   */
  findToolResultMessage(
    messages: ModelMessage[],
    toolCallId: string
  ): ModelMessage | null {
    for (const message of messages) {
      const results = this.extractToolResults(message);
      if (results.some(r => r.tool_use_id === toolCallId)) {
        return message;
      }
    }

    return null;
  }

  /**
   * Transform with full processing pipeline
   */
  transformComplete(messages: SessionMessage[]): ModelMessage[] {
    // Step 1: Transform to model format
    let modelMessages = this.transformMany(messages);

    // Step 2: Merge consecutive same-role messages
    modelMessages = this.mergeConsecutive(modelMessages);

    // Step 3: Ensure alternating pattern
    modelMessages = this.ensureAlternating(modelMessages);

    return modelMessages;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create message transformer
 */
export function createMessageTransformer(): MessageTransformer {
  return new MessageTransformer();
}
