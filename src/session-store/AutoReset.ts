/**
 * Auto-reset functionality for sessions
 */

import type { Message, AutoResetConfig } from './types';

/**
 * Check if session should be auto-reset
 */
export function shouldAutoReset(
  messages: Message[],
  config: AutoResetConfig
): boolean {
  if (!config.enabled) {
    return false;
  }

  // Check max messages
  if (config.maxMessages && messages.length >= config.maxMessages) {
    return true;
  }

  // Check max age
  if (config.maxAgeMs && messages.length > 0) {
    const oldestMessage = messages[0];
    const age = Date.now() - oldestMessage.timestamp;
    if (age >= config.maxAgeMs) {
      return true;
    }
  }

  // Check max tokens (if tokenCounter provided)
  if (config.maxTokens && config.tokenCounter) {
    const totalTokens = messages.reduce((sum, msg) => {
      return sum + config.tokenCounter!(msg);
    }, 0);
    if (totalTokens >= config.maxTokens) {
      return true;
    }
  }

  return false;
}

/**
 * Perform auto-reset on session
 * Returns messages to keep
 */
export function performAutoReset(
  messages: Message[],
  config: AutoResetConfig
): Message[] {
  if (!config.keepStrategy) {
    return []; // Keep nothing
  }

  switch (config.keepStrategy) {
    case 'none':
      return [];

    case 'first':
      return messages.slice(0, config.keepCount ?? 1);

    case 'last':
      return messages.slice(-(config.keepCount ?? 1));

    case 'system': {
      // Keep only system messages
      const systemMessages = messages.filter(m => m.type === 'system');
      if (config.keepCount) {
        return systemMessages.slice(0, config.keepCount);
      }
      return systemMessages;
    }

    default:
      return [];
  }
}

/**
 * Create reset marker message
 */
export function createResetMarker(reason: string): Message {
  return {
    id: `reset-${Date.now()}`,
    timestamp: Date.now(),
    type: 'system',
    role: 'system',
    content: `[AUTO-RESET: ${reason}]`,
    parentId: null
  };
}

/**
 * Auto-reset manager
 */
export class AutoResetManager {
  constructor(private config: AutoResetConfig) {}

  /**
   * Check and perform reset if needed
   * Returns: { reset: boolean, messages: Message[] }
   */
  checkAndReset(messages: Message[]): { reset: boolean; messages: Message[] } {
    if (!shouldAutoReset(messages, this.config)) {
      return { reset: false, messages };
    }

    const kept = performAutoReset(messages, this.config);
    const reason = this.getResetReason(messages);
    
    if (this.config.insertResetMarker) {
      const marker = createResetMarker(reason);
      return { reset: true, messages: [...kept, marker] };
    }

    return { reset: true, messages: kept };
  }

  /**
   * Get reason for reset
   */
  private getResetReason(messages: Message[]): string {
    const reasons: string[] = [];

    if (this.config.maxMessages && messages.length >= this.config.maxMessages) {
      reasons.push(`max messages (${this.config.maxMessages})`);
    }

    if (this.config.maxAgeMs && messages.length > 0) {
      const age = Date.now() - messages[0].timestamp;
      if (age >= this.config.maxAgeMs) {
        reasons.push(`max age (${this.config.maxAgeMs}ms)`);
      }
    }

    if (this.config.maxTokens && this.config.tokenCounter) {
      const total = messages.reduce((s, m) => s + this.config.tokenCounter!(m), 0);
      if (total >= this.config.maxTokens) {
        reasons.push(`max tokens (${this.config.maxTokens})`);
      }
    }

    return reasons.join(', ') || 'unknown';
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AutoResetConfig>): void {
    Object.assign(this.config, updates);
  }

  /**
   * Get current config
   */
  getConfig(): AutoResetConfig {
    return { ...this.config };
  }
}
