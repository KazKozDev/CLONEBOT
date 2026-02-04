/**
 * Callback Query Handler
 * 
 * Handles inline keyboard callback queries
 */

import { ParsedCallback, CallbackContext, CallbackHandler } from './types';
import { EventEmitter } from 'events';

export class CallbackQueryHandler extends EventEmitter {
  private callbacks: Map<string | RegExp, CallbackHandler>;

  constructor() {
    super();
    this.callbacks = new Map();
  }

  /**
   * Register a callback handler
   * @param pattern - String or RegExp pattern to match callback data
   * @param handler - Handler function
   */
  registerCallback(pattern: string | RegExp, handler: CallbackHandler): void {
    this.callbacks.set(pattern, handler);
  }

  /**
   * Unregister a callback handler
   */
  unregisterCallback(pattern: string | RegExp): void {
    this.callbacks.delete(pattern);
  }

  /**
   * Handle incoming callback query
   */
  async handleCallback(query: ParsedCallback): Promise<void> {
    if (!query.data) {
      this.emit('no_data', query);
      return;
    }
    
    // Find matching handler
    const handler = this.findHandler(query.data);
    
    if (!handler) {
      this.emit('unknown_callback', query);
      return;
    }
    
    const context: CallbackContext = {
      query,
      data: query.data,
    };
    
    try {
      await handler(context);
    } catch (error) {
      this.emit('callback_error', { query, error, context });
      throw error;
    }
  }

  /**
   * Find handler for callback data
   */
  private findHandler(data: string): CallbackHandler | null {
    for (const [pattern, handler] of this.callbacks.entries()) {
      if (typeof pattern === 'string') {
        if (data === pattern) {
          return handler;
        }
      } else {
        // RegExp pattern
        if (pattern.test(data)) {
          return handler;
        }
      }
    }
    
    return null;
  }

  /**
   * Parse callback data (action:param1:param2 format)
   */
  parseCallbackData(data: string): { action: string; params: string[] } {
    const parts = data.split(':');
    const action = parts[0];
    const params = parts.slice(1);
    
    return { action, params };
  }

  /**
   * Build callback data (action:param1:param2 format)
   */
  buildCallbackData(action: string, ...params: string[]): string {
    const data = [action, ...params].join(':');
    
    // Telegram limit is 64 bytes
    if (Buffer.byteLength(data, 'utf8') > 64) {
      throw new Error('Callback data exceeds 64 bytes limit');
    }
    
    return data;
  }

  /**
   * Get registered callback patterns
   */
  getCallbacks(): (string | RegExp)[] {
    return Array.from(this.callbacks.keys());
  }

  /**
   * Check if callback pattern is registered
   */
  hasCallback(pattern: string | RegExp): boolean {
    return this.callbacks.has(pattern);
  }
}
