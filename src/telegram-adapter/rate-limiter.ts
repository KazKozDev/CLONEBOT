/**
 * Rate Limiter
 * 
 * Manages rate limiting for Telegram API requests
 */

import { RateLimitState, ChatRateLimitState, RateLimitStats } from './types';

export interface RateLimiterConfig {
  messagesPerSecond?: number;
  messagesPerMinutePerGroup?: number;
}

export class RateLimiter {
  private state: RateLimitState;
  
  private readonly globalLimit: number;
  private readonly groupLimit: number;
  
  constructor(config: RateLimiterConfig = {}) {
    this.globalLimit = config.messagesPerSecond ?? 25; // Under Telegram's 30/sec limit
    this.groupLimit = config.messagesPerMinutePerGroup ?? 18; // Under Telegram's 20/min limit
    
    this.state = {
      messagesSentLastSecond: 0,
      messagesSentLastMinute: 0,
      lastMessageTime: 0,
      chatStates: new Map(),
    };
  }

  /**
   * Acquire permission to send message
   * Waits if rate limit would be exceeded
   */
  async acquire(chatId: string, isGroup: boolean = false): Promise<void> {
    // Clean up old state
    this.cleanup();
    
    // Check global rate limit
    while (this.state.messagesSentLastSecond >= this.globalLimit) {
      await this.delay(100);
      this.cleanup();
    }
    
    // Check chat-specific rate limit for groups
    if (isGroup) {
      const chatState = this.getChatState(chatId, isGroup);
      
      while (chatState.messagesInWindow >= this.groupLimit) {
        await this.delay(100);
        this.cleanup();
      }
    }
    
    // Permission granted, will be released after send
  }

  /**
   * Release (record that message was sent)
   */
  release(chatId: string, isGroup: boolean = false): void {
    const now = Date.now();
    
    // Update global counters
    this.state.messagesSentLastSecond++;
    this.state.messagesSentLastMinute++;
    this.state.lastMessageTime = now;
    
    // Update chat-specific counter for groups
    if (isGroup) {
      const chatState = this.getChatState(chatId, isGroup);
      chatState.messagesInWindow++;
    }
  }

  /**
   * Get rate limit stats
   */
  getStats(): RateLimitStats {
    this.cleanup();
    
    const chatRates = new Map<string, number>();
    
    for (const [chatId, state] of this.state.chatStates.entries()) {
      chatRates.set(chatId, state.messagesInWindow);
    }
    
    return {
      globalRate: this.state.messagesSentLastSecond,
      chatRates,
    };
  }

  /**
   * Handle rate limit error (429)
   */
  async handleRateLimitError(retryAfter?: number): Promise<void> {
    const waitTime = retryAfter ? retryAfter * 1000 : 1000;
    await this.delay(waitTime);
  }

  /**
   * Get or create chat state
   */
  private getChatState(chatId: string, isGroup: boolean): ChatRateLimitState {
    let chatState = this.state.chatStates.get(chatId);
    
    if (!chatState) {
      chatState = {
        messagesInWindow: 0,
        windowStart: Date.now(),
        isGroup,
      };
      this.state.chatStates.set(chatId, chatState);
    }
    
    return chatState;
  }

  /**
   * Clean up old rate limit state
   */
  private cleanup(): void {
    const now = Date.now();
    
    // Reset second counter if more than 1 second has passed
    if (now - this.state.lastMessageTime > 1000) {
      this.state.messagesSentLastSecond = 0;
    }
    
    // Reset minute counter if more than 60 seconds has passed
    if (now - this.state.lastMessageTime > 60000) {
      this.state.messagesSentLastMinute = 0;
    }
    
    // Clean up chat states
    for (const [chatId, chatState] of this.state.chatStates.entries()) {
      // Reset window if more than 60 seconds has passed
      if (now - chatState.windowStart > 60000) {
        chatState.messagesInWindow = 0;
        chatState.windowStart = now;
      }
      
      // Remove inactive chats
      if (now - chatState.windowStart > 120000 && chatState.messagesInWindow === 0) {
        this.state.chatStates.delete(chatId);
      }
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset rate limiter state
   */
  reset(): void {
    this.state = {
      messagesSentLastSecond: 0,
      messagesSentLastMinute: 0,
      lastMessageTime: 0,
      chatStates: new Map(),
    };
  }
}
