/**
 * Error Handler
 * 
 * Handles Telegram API errors and determines appropriate actions
 */

import { TelegramApiError, ErrorAction } from './types';
import { MessageSender } from './message-sender';

export interface ErrorHandlerConfig {
  notifyUser?: boolean;
  maxRetries?: number;
}

export class TelegramErrorHandler {
  private readonly shouldNotifyUser: boolean;
  private readonly maxRetries: number;

  constructor(
    private sender: MessageSender,
    config: ErrorHandlerConfig = {}
  ) {
    this.shouldNotifyUser = config.notifyUser ?? true;
    this.maxRetries = config.maxRetries ?? 3;
  }

  /**
   * Handle API error and determine action
   */
  handleApiError(error: Error, context?: { chatId?: string; attempt?: number }): ErrorAction {
    if (!(error instanceof TelegramApiError)) {
      // Non-Telegram error, treat as fatal
      return 'fatal';
    }
    
    const errorCode = error.errorCode;
    
    switch (errorCode) {
      case 400:
        // Bad Request - invalid params, notify user
        return 'notify';
      
      case 401:
        // Unauthorized - bad token, fatal
        return 'fatal';
      
      case 403:
        // Forbidden - bot blocked/kicked, skip this chat
        return 'skip';
      
      case 404:
        // Not Found - chat not found, skip
        return 'skip';
      
      case 429:
        // Too Many Requests - rate limit, retry
        return 'retry';
      
      case 500:
      case 502:
      case 503:
      case 504:
        // Server Error - retry
        if (context?.attempt && context.attempt >= this.maxRetries) {
          return 'notify';
        }
        return 'retry';
      
      default:
        // Unknown error
        return 'notify';
    }
  }

  /**
   * Check if error should be retried
   */
  shouldRetry(error: Error, attempt: number = 1): boolean {
    if (!(error instanceof TelegramApiError)) {
      return false;
    }
    
    if (attempt >= this.maxRetries) {
      return false;
    }
    
    const errorCode = error.errorCode;
    
    // Retry on rate limit and server errors
    return (
      errorCode === 429 ||
      (errorCode !== undefined && errorCode >= 500)
    );
  }

  /**
   * Get retry delay for error
   */
  getRetryDelay(error: Error, attempt: number = 1): number {
    if (error instanceof TelegramApiError && error.retryAfter) {
      // Use Telegram's retry_after if provided
      return error.retryAfter * 1000;
    }
    
    // Exponential backoff: 1s, 2s, 4s, 8s...
    return Math.min(1000 * Math.pow(2, attempt - 1), 30000);
  }

  /**
   * Notify user about error
   */
  async notifyUser(chatId: string, error: Error): Promise<void> {
    if (!this.shouldNotifyUser) {
      return;
    }
    
    let message: string;
    
    if (error instanceof TelegramApiError) {
      switch (error.errorCode) {
        case 400:
          message = '❌ Invalid request. Please check your input.';
          break;
        case 403:
          message = '❌ I don\'t have permission to perform this action.';
          break;
        case 404:
          message = '❌ Chat or message not found.';
          break;
        case 429:
          message = '⏳ Too many requests. Please wait a moment.';
          break;
        default:
          message = `❌ An error occurred: ${error.message}`;
      }
    } else {
      message = `❌ An unexpected error occurred: ${error.message}`;
    }
    
    try {
      await this.sender.send(chatId, message);
    } catch (sendError) {
      // Failed to notify user, ignore
    }
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(error: Error): string {
    if (error instanceof TelegramApiError) {
      switch (error.errorCode) {
        case 400:
          return 'Invalid request. Please check your input.';
        case 403:
          return 'Permission denied.';
        case 404:
          return 'Not found.';
        case 429:
          return 'Too many requests. Please wait.';
        case 500:
        case 502:
        case 503:
        case 504:
          return 'Server error. Please try again later.';
        default:
          return error.description ?? 'An error occurred.';
      }
    }
    
    return 'An unexpected error occurred.';
  }

  /**
   * Check if error is fatal (should stop adapter)
   */
  isFatal(error: Error): boolean {
    if (!(error instanceof TelegramApiError)) {
      return false;
    }
    
    // Only unauthorized is fatal
    return error.errorCode === 401;
  }

  /**
   * Log error with context
   */
  logError(error: Error, context?: Record<string, any>): void {
    console.error('[Telegram Error]', {
      error: error.message,
      ...(error instanceof TelegramApiError && {
        code: error.errorCode,
        description: error.description,
      }),
      ...context,
    });
  }
}
