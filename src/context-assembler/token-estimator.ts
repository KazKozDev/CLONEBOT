/**
 * Token Estimator
 * 
 * Estimates token count for different types of content.
 * Supports two approaches:
 * - Simple: ~4 characters per token (fast, approximate)
 * - Tiktoken: Accurate tokenization using tiktoken library
 */

import type { ContentBlock, ModelMessage, ToolDefinition } from './types';

// ============================================================================
// Types
// ============================================================================

export type TokenEstimationMode = 'simple' | 'tiktoken';

export interface TokenEstimatorOptions {
  mode?: TokenEstimationMode;
  encoding?: string; // For tiktoken: 'cl100k_base', 'p50k_base', etc.
}

// ============================================================================
// Simple Estimator
// ============================================================================

class SimpleTokenEstimator {
  /**
   * Estimate tokens using simple character-based heuristic
   */
  estimate(text: string): number {
    if (!text) return 0;
    
    // Average: 1 token ≈ 4 characters
    // But Russian/CJK use more tokens per character
    const russianChars = (text.match(/[а-яА-ЯёЁ]/g) || []).length;
    const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
    const otherChars = text.length - russianChars - cjkChars;
    
    // Russian: ~2.5 chars per token
    // CJK: ~1.5 chars per token
    // Other: ~4 chars per token
    const estimate = Math.ceil(
      russianChars / 2.5 + 
      cjkChars / 1.5 + 
      otherChars / 4
    );
    
    return Math.max(1, estimate);
  }
}

// ============================================================================
// Tiktoken Estimator
// ============================================================================

class TiktokenEstimator {
  private encoding: string;
  private encoder: any = null;
  
  constructor(encoding: string = 'cl100k_base') {
    this.encoding = encoding;
  }
  
  /**
   * Get or initialize tiktoken encoder
   */
  private async getEncoder() {
    if (this.encoder) return this.encoder;
    
    try {
      // Try to load tiktoken (optional dependency)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const tiktoken = require('tiktoken');
      this.encoder = tiktoken.encoding_for_model(this.encoding);
      return this.encoder;
    } catch (err) {
      // Tiktoken not available, fall back to simple estimator
      return null;
    }
  }
  
  /**
   * Estimate tokens using tiktoken
   */
  async estimate(text: string): Promise<number> {
    if (!text) return 0;
    
    const encoder = await this.getEncoder();
    
    if (!encoder) {
      // Fall back to simple estimation
      const simple = new SimpleTokenEstimator();
      return simple.estimate(text);
    }
    
    try {
      const tokens = encoder.encode(text);
      return tokens.length;
    } catch (err) {
      // Error encoding, fall back to simple
      const simple = new SimpleTokenEstimator();
      return simple.estimate(text);
    }
  }
}

// ============================================================================
// Token Estimator
// ============================================================================

export class TokenEstimator {
  private mode: TokenEstimationMode;
  private simpleEstimator: SimpleTokenEstimator;
  private tiktokenEstimator: TiktokenEstimator | null = null;
  
  constructor(options: TokenEstimatorOptions = {}) {
    this.mode = options.mode || 'simple';
    this.simpleEstimator = new SimpleTokenEstimator();
    
    if (this.mode === 'tiktoken') {
      this.tiktokenEstimator = new TiktokenEstimator(options.encoding);
    }
  }
  
  /**
   * Estimate tokens for text
   */
  async estimateText(text: string): Promise<number> {
    if (this.mode === 'tiktoken' && this.tiktokenEstimator) {
      return this.tiktokenEstimator.estimate(text);
    }
    
    return this.simpleEstimator.estimate(text);
  }
  
  /**
   * Estimate tokens for content block
   */
  async estimateContentBlock(block: ContentBlock): Promise<number> {
    switch (block.type) {
      case 'text':
        return this.estimateText(block.text);
        
      case 'image':
        // Images use fixed token budget based on size
        // Small: ~85 tokens, Medium: ~170 tokens, Large: ~255 tokens
        // We'll estimate based on data length
        const dataLength = block.source.data.length;
        if (dataLength < 10000) return 85;
        if (dataLength < 50000) return 170;
        return 255;
        
      case 'tool_use':
        // Tool use: name + input
        const nameTokens = await this.estimateText(block.name);
        const inputTokens = await this.estimateText(JSON.stringify(block.input, null, 2));
        return nameTokens + inputTokens + 5; // +5 for structure overhead
        
      case 'tool_result':
        // Tool result: content + id
        const contentTokens = await this.estimateText(block.content);
        return contentTokens + 5; // +5 for structure overhead
        
      default:
        return 0;
    }
  }
  
  /**
   * Estimate tokens for message content
   */
  async estimateContent(content: string | ContentBlock[]): Promise<number> {
    if (typeof content === 'string') {
      return this.estimateText(content);
    }
    
    let total = 0;
    for (const block of content) {
      total += await this.estimateContentBlock(block);
    }
    
    return total;
  }
  
  /**
   * Estimate tokens for a single message
   */
  async estimateMessage(message: ModelMessage): Promise<number> {
    // Role: ~1 token
    // Content: variable
    // Overhead: ~4 tokens per message
    const roleTokens = 1;
    const contentTokens = await this.estimateContent(message.content);
    const overhead = 4;
    
    return roleTokens + contentTokens + overhead;
  }
  
  /**
   * Estimate tokens for array of messages
   */
  async estimateMessages(messages: ModelMessage[]): Promise<number> {
    let total = 0;
    for (const message of messages) {
      total += await this.estimateMessage(message);
    }
    
    return total;
  }
  
  /**
   * Estimate tokens for tool definition
   */
  async estimateTool(tool: ToolDefinition): Promise<number> {
    // Tool: name + description + parameters
    const nameTokens = await this.estimateText(tool.name);
    const descTokens = await this.estimateText(tool.description);
    const paramsTokens = await this.estimateText(JSON.stringify(tool.parameters, null, 2));
    
    return nameTokens + descTokens + paramsTokens + 10; // +10 for structure
  }
  
  /**
   * Estimate tokens for array of tools
   */
  async estimateTools(tools: ToolDefinition[]): Promise<number> {
    let total = 0;
    for (const tool of tools) {
      total += await this.estimateTool(tool);
    }
    
    // Add overhead for tools array structure
    return total + (tools.length > 0 ? 20 : 0);
  }
  
  /**
   * Estimate tokens for system prompt
   */
  async estimateSystemPrompt(prompt: string): Promise<number> {
    // System prompt has ~10 tokens overhead
    const contentTokens = await this.estimateText(prompt);
    return contentTokens + 10;
  }
  
  /**
   * Get simple synchronous estimate (uses simple mode)
   */
  estimateSimple(text: string): number {
    return this.simpleEstimator.estimate(text);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create token estimator
 */
export function createTokenEstimator(options: TokenEstimatorOptions = {}): TokenEstimator {
  return new TokenEstimator(options);
}
