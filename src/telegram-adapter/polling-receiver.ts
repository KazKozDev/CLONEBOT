/**
 * Long Polling Receiver
 * 
 * Receives updates from Telegram using long polling
 */

import { TelegramApiClient } from './api-client';
import { TelegramUpdate, PollingConfig } from './types';
import { EventEmitter } from 'events';

export class LongPollingReceiver extends EventEmitter {
  private running = false;
  private offset = 0;
  private pollingPromise: Promise<void> | null = null;
  
  private readonly timeout: number;
  private readonly interval: number;
  private readonly allowedUpdates: string[];

  constructor(
    private apiClient: TelegramApiClient,
    config: PollingConfig = {}
  ) {
    super();
    this.timeout = config.timeout ?? 30;
    this.interval = config.interval ?? 0;
    this.allowedUpdates = config.allowedUpdates ?? [
      'message',
      'edited_message',
      'callback_query',
      'my_chat_member',
    ];
  }

  /**
   * Start receiving updates
   */
  start(): void {
    if (this.running) {
      return;
    }
    
    this.running = true;
    this.pollingPromise = this.poll();
  }

  /**
   * Stop receiving updates
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    
    this.running = false;
    
    if (this.pollingPromise) {
      await this.pollingPromise;
    }
  }

  /**
   * Check if receiver is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Main polling loop
   */
  private async poll(): Promise<void> {
    while (this.running) {
      try {
        const updates = await this.getUpdates();
        
        for (const update of updates) {
          this.offset = Math.max(this.offset, update.update_id + 1);
          this.emit('update', update);
        }
        
        // Wait before next poll if configured
        if (this.interval > 0) {
          await this.delay(this.interval);
        }
      } catch (error) {
        this.emit('error', error);
        
        // Wait before retrying on error
        await this.delay(5000);
      }
    }
  }

  /**
   * Get updates from Telegram
   */
  private async getUpdates(): Promise<TelegramUpdate[]> {
    try {
      const updates = await this.apiClient.call<TelegramUpdate[]>('getUpdates', {
        offset: this.offset,
        timeout: this.timeout,
        allowed_updates: this.allowedUpdates,
      });
      
      return updates ?? [];
    } catch (error) {
      // Return empty array on error, will be retried
      return [];
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Register update handler
   */
  onUpdate(handler: (update: TelegramUpdate) => void): () => void {
    this.on('update', handler);
    return () => this.off('update', handler);
  }

  /**
   * Register error handler
   */
  onError(handler: (error: Error) => void): () => void {
    this.on('error', handler);
    return () => this.off('error', handler);
  }
}
