/**
 * Context Truncation
 * 
 * Truncates message history to fit within token limits.
 * Supports three strategies: simple, smart, sliding.
 */

import type { ModelMessage, TruncationInfo } from './types';
import type { TokenEstimator } from './token-estimator';
import type { MessageTransformer } from './message-transformer';

// ============================================================================
// Types
// ============================================================================

export type TruncationStrategy = 'simple' | 'smart' | 'sliding';

export interface TruncationOptions {
  strategy: TruncationStrategy;
  maxTokens: number;
  reserveTokens: number;
  systemPromptTokens: number;
  toolsTokens: number;
}

// ============================================================================
// Context Truncator
// ============================================================================

export class ContextTruncator {
  private tokenEstimator: TokenEstimator;
  private messageTransformer: MessageTransformer;
  
  constructor(tokenEstimator: TokenEstimator, messageTransformer: MessageTransformer) {
    this.tokenEstimator = tokenEstimator;
    this.messageTransformer = messageTransformer;
  }
  
  /**
   * Truncate messages to fit within token limit
   */
  async truncate(
    messages: ModelMessage[],
    options: TruncationOptions
  ): Promise<{ messages: ModelMessage[]; info: TruncationInfo }> {
    // Calculate available tokens for messages
    const availableTokens = 
      options.maxTokens - 
      options.systemPromptTokens - 
      options.toolsTokens - 
      options.reserveTokens;
    
    // Choose strategy
    switch (options.strategy) {
      case 'simple':
        return this.truncateSimple(messages, availableTokens);
        
      case 'smart':
        return this.truncateSmart(messages, availableTokens);
        
      case 'sliding':
        return this.truncateSliding(messages, availableTokens);
        
      default:
        throw new Error(`Unknown truncation strategy: ${options.strategy}`);
    }
  }
  
  /**
   * Simple truncation: remove oldest messages until fits
   */
  private async truncateSimple(
    messages: ModelMessage[],
    maxTokens: number
  ): Promise<{ messages: ModelMessage[]; info: TruncationInfo }> {
    const originalTokens = await this.estimateMessages(messages);
    
    if (originalTokens <= maxTokens) {
      return {
        messages,
        info: {
          strategy: 'simple',
          removedCount: 0,
          removedTokens: 0,
          originalTokens,
          finalTokens: originalTokens,
        },
      };
    }
    
    // Remove messages from the start until we fit
    let result = [...messages];
    let currentTokens = originalTokens;
    let removedCount = 0;
    
    while (currentTokens > maxTokens && result.length > 1) {
      const removed = result.shift()!;
      removedCount++;
      currentTokens = await this.estimateMessages(result);
    }
    
    return {
      messages: result,
      info: {
        strategy: 'simple',
        removedCount,
        removedTokens: originalTokens - currentTokens,
        originalTokens,
        finalTokens: currentTokens,
      },
    };
  }
  
  /**
   * Smart truncation: preserve tool call/result pairs
   */
  private async truncateSmart(
    messages: ModelMessage[],
    maxTokens: number
  ): Promise<{ messages: ModelMessage[]; info: TruncationInfo }> {
    const originalTokens = await this.estimateMessages(messages);
    
    if (originalTokens <= maxTokens) {
      return {
        messages,
        info: {
          strategy: 'smart',
          removedCount: 0,
          removedTokens: 0,
          originalTokens,
          finalTokens: originalTokens,
        },
      };
    }
    
    // Build map of tool call -> result indices
    const toolCallMap = this.buildToolCallMap(messages);
    
    // Remove messages from start, skipping tool call/result pairs
    const result: ModelMessage[] = [];
    let currentTokens = 0;
    let removedCount = 0;
    
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const messageTokens = await this.tokenEstimator.estimateMessage(message);
      
      // Check if this is part of a tool call pair
      const isPartOfPair = 
        this.isToolCallMessage(message) && toolCallMap.has(i) ||
        this.isToolResultMessage(message) && this.isResultOfToolCall(i, toolCallMap);
      
      // If we're over budget and this isn't part of a pair, skip it
      if (currentTokens + messageTokens > maxTokens && !isPartOfPair && result.length > 0) {
        removedCount++;
        continue;
      }
      
      result.push(message);
      currentTokens += messageTokens;
    }
    
    const finalTokens = await this.estimateMessages(result);
    
    return {
      messages: result,
      info: {
        strategy: 'smart',
        removedCount,
        removedTokens: originalTokens - finalTokens,
        originalTokens,
        finalTokens,
      },
    };
  }
  
  /**
   * Sliding window: keep recent messages within window
   */
  private async truncateSliding(
    messages: ModelMessage[],
    maxTokens: number
  ): Promise<{ messages: ModelMessage[]; info: TruncationInfo }> {
    const originalTokens = await this.estimateMessages(messages);
    
    if (originalTokens <= maxTokens) {
      return {
        messages,
        info: {
          strategy: 'sliding',
          removedCount: 0,
          removedTokens: 0,
          originalTokens,
          finalTokens: originalTokens,
        },
      };
    }
    
    // Take messages from the end until we hit the limit
    const result: ModelMessage[] = [];
    let currentTokens = 0;
    
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const messageTokens = await this.tokenEstimator.estimateMessage(message);
      
      if (currentTokens + messageTokens > maxTokens) {
        break; // Reached limit
      }
      
      result.unshift(message); // Add to start
      currentTokens += messageTokens;
    }
    
    const removedCount = messages.length - result.length;
    const finalTokens = await this.estimateMessages(result);
    
    return {
      messages: result,
      info: {
        strategy: 'sliding',
        removedCount,
        removedTokens: originalTokens - finalTokens,
        originalTokens,
        finalTokens,
      },
    };
  }
  
  /**
   * Build map of tool call indices to result indices
   */
  private buildToolCallMap(messages: ModelMessage[]): Map<number, number> {
    const map = new Map<number, number>();
    
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const toolCalls = this.messageTransformer.extractToolCalls(message);
      
      if (toolCalls.length > 0) {
        // Find corresponding results
        for (const toolCall of toolCalls) {
          const resultIdx = this.findToolResultIndex(messages, toolCall.id, i);
          if (resultIdx !== -1) {
            map.set(i, resultIdx);
          }
        }
      }
    }
    
    return map;
  }
  
  /**
   * Find index of tool result message
   */
  private findToolResultIndex(
    messages: ModelMessage[],
    toolCallId: string,
    startFrom: number
  ): number {
    for (let i = startFrom + 1; i < messages.length; i++) {
      const results = this.messageTransformer.extractToolResults(messages[i]);
      if (results.some(r => r.tool_use_id === toolCallId)) {
        return i;
      }
    }
    
    return -1;
  }
  
  /**
   * Check if message contains tool calls
   */
  private isToolCallMessage(message: ModelMessage): boolean {
    return this.messageTransformer.hasToolCalls(message);
  }
  
  /**
   * Check if message contains tool results
   */
  private isToolResultMessage(message: ModelMessage): boolean {
    return this.messageTransformer.hasToolResults(message);
  }
  
  /**
   * Check if result index is part of tool call map
   */
  private isResultOfToolCall(
    resultIdx: number,
    toolCallMap: Map<number, number>
  ): boolean {
    for (const [_, resIdx] of toolCallMap) {
      if (resIdx === resultIdx) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Estimate total tokens for messages
   */
  private async estimateMessages(messages: ModelMessage[]): Promise<number> {
    return this.tokenEstimator.estimateMessages(messages);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create context truncator
 */
export function createContextTruncator(
  tokenEstimator: TokenEstimator,
  messageTransformer: MessageTransformer
): ContextTruncator {
  return new ContextTruncator(tokenEstimator, messageTransformer);
}
