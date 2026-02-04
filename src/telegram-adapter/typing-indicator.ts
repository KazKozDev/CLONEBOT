/**
 * Typing Indicator
 * 
 * Manages "typing..." indicator for chats
 */

import { MessageSender } from './message-sender';

export type ChatAction = 'typing' | 'upload_photo' | 'upload_document' | 'upload_video' | 'upload_audio';

export class TypingIndicator {
  private activeIndicators: Map<string, NodeJS.Timeout>;
  private readonly repeatInterval = 5000; // 5 seconds

  constructor(private sender: MessageSender) {
    this.activeIndicators = new Map();
  }

  /**
   * Start typing indicator for chat
   */
  start(chatId: string | number, action: ChatAction = 'typing'): TypingIndicatorControl {
    const key = `${chatId}:${action}`;
    
    // Stop existing indicator for this chat/action
    this.stop(chatId, action);
    
    // Send initial action
    this.sendAction(chatId, action);
    
    // Set up periodic repeat
    const interval = setInterval(() => {
      this.sendAction(chatId, action);
    }, this.repeatInterval);
    
    this.activeIndicators.set(key, interval);
    
    // Return control object
    return {
      stop: () => this.stop(chatId, action),
    };
  }

  /**
   * Stop typing indicator for chat
   */
  stop(chatId: string | number, action: ChatAction = 'typing'): void {
    const key = `${chatId}:${action}`;
    const interval = this.activeIndicators.get(key);
    
    if (interval) {
      clearInterval(interval);
      this.activeIndicators.delete(key);
    }
  }

  /**
   * Stop all typing indicators
   */
  stopAll(): void {
    for (const interval of this.activeIndicators.values()) {
      clearInterval(interval);
    }
    this.activeIndicators.clear();
  }

  /**
   * Send chat action
   */
  private async sendAction(chatId: string | number, action: ChatAction): Promise<void> {
    try {
      await this.sender.sendAction(chatId, action);
    } catch (error) {
      // Ignore errors (chat may be closed, etc.)
    }
  }

  /**
   * Check if indicator is active for chat
   */
  isActive(chatId: string | number, action: ChatAction = 'typing'): boolean {
    const key = `${chatId}:${action}`;
    return this.activeIndicators.has(key);
  }

  /**
   * Get count of active indicators
   */
  getActiveCount(): number {
    return this.activeIndicators.size;
  }
}

export interface TypingIndicatorControl {
  stop(): void;
}
