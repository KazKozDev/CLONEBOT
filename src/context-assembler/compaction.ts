/**
 * Compaction Detection
 * 
 * Determines when a session needs compaction.
 */

import type { CompactionCheck, SessionStats, ContextAssemblerConfig } from './types';

// ============================================================================
// Compaction Detector
// ============================================================================

export class CompactionDetector {
  private config: ContextAssemblerConfig;
  
  constructor(config: ContextAssemblerConfig) {
    this.config = config;
  }
  
  /**
   * Check if compaction is needed
   */
  check(
    stats: SessionStats,
    currentTokens: number,
    maxContextTokens: number,
    explicitRequest: boolean = false
  ): CompactionCheck {
    // Explicit request
    if (explicitRequest) {
      return {
        needed: true,
        reason: 'explicit',
        currentTokens,
        threshold: maxContextTokens,
        currentMessages: stats.messageCount,
        messageThreshold: this.config.compactionMessageThreshold,
      };
    }
    
    // Check token threshold
    const tokenThresholdPercent = this.config.compactionThreshold;
    const tokenThreshold = maxContextTokens * tokenThresholdPercent;
    
    if (currentTokens >= tokenThreshold) {
      return {
        needed: true,
        reason: 'token_limit',
        currentTokens,
        threshold: tokenThreshold,
        currentMessages: stats.messageCount,
        messageThreshold: this.config.compactionMessageThreshold,
      };
    }
    
    // Check message count threshold
    if (stats.messageCount >= this.config.compactionMessageThreshold) {
      return {
        needed: true,
        reason: 'message_count',
        currentTokens,
        threshold: tokenThreshold,
        currentMessages: stats.messageCount,
        messageThreshold: this.config.compactionMessageThreshold,
      };
    }
    
    // Check tool call threshold (arbitrary: 50+ tool calls)
    if (stats.toolCallCount >= 50) {
      return {
        needed: true,
        reason: 'tool_count',
        currentTokens,
        threshold: tokenThreshold,
        currentMessages: stats.messageCount,
        messageThreshold: this.config.compactionMessageThreshold,
      };
    }
    
    // No compaction needed
    return {
      needed: false,
      reason: 'none',
      currentTokens,
      threshold: tokenThreshold,
      currentMessages: stats.messageCount,
      messageThreshold: this.config.compactionMessageThreshold,
    };
  }
  
  /**
   * Calculate session stats from token estimate and message count
   */
  calculateStats(
    messageCount: number,
    tokenCount: number,
    toolCallCount: number,
    lastCompactionAt?: string
  ): SessionStats {
    return {
      messageCount,
      tokenCount,
      toolCallCount,
      lastCompactionAt,
    };
  }
  
  /**
   * Check if session was recently compacted
   */
  wasRecentlyCompacted(lastCompactionAt: string | undefined, thresholdMs: number = 300_000): boolean {
    if (!lastCompactionAt) {
      return false;
    }
    
    const lastCompaction = new Date(lastCompactionAt);
    const now = new Date();
    const elapsed = now.getTime() - lastCompaction.getTime();
    
    return elapsed < thresholdMs;
  }
  
  /**
   * Get compaction priority (higher = more urgent)
   */
  getPriority(check: CompactionCheck): number {
    if (!check.needed) {
      return 0;
    }
    
    switch (check.reason) {
      case 'explicit':
        return 1000; // Highest priority
        
      case 'token_limit':
        return 900;
        
      case 'message_count':
        return 500;
        
      case 'tool_count':
        return 400;
        
      default:
        return 0;
    }
  }
  
  /**
   * Get human-readable reason
   */
  getReason(check: CompactionCheck): string {
    if (!check.needed) {
      return 'No compaction needed';
    }
    
    switch (check.reason) {
      case 'explicit':
        return 'Compaction explicitly requested';
        
      case 'token_limit':
        return `Token count (${check.currentTokens}) exceeded threshold (${Math.round(check.threshold)})`;
        
      case 'message_count':
        return `Message count (${check.currentMessages}) exceeded threshold (${check.messageThreshold})`;
        
      case 'tool_count':
        return 'Tool call count exceeded threshold';
        
      default:
        return 'Unknown reason';
    }
  }
  
  /**
   * Estimate time until compaction needed (in messages)
   */
  estimateTimeUntilCompaction(
    currentStats: SessionStats,
    maxContextTokens: number,
    avgTokensPerMessage: number = 100
  ): number {
    const tokenThreshold = maxContextTokens * this.config.compactionThreshold;
    const messageThreshold = this.config.compactionMessageThreshold;
    
    // Time until token threshold
    const tokensRemaining = tokenThreshold - currentStats.tokenCount;
    const messagesUntilTokenLimit = Math.floor(tokensRemaining / avgTokensPerMessage);
    
    // Time until message threshold
    const messagesUntilMessageLimit = messageThreshold - currentStats.messageCount;
    
    // Return minimum
    return Math.max(0, Math.min(messagesUntilTokenLimit, messagesUntilMessageLimit));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create compaction detector
 */
export function createCompactionDetector(config: ContextAssemblerConfig): CompactionDetector {
  return new CompactionDetector(config);
}
