/**
 * WebSocket Message Protocol
 * 
 * JSON-based message format with request/response correlation
 */

import type { WebSocketMessage } from './types';

/**
 * Parse WebSocket message
 */
export function parseMessage(data: string | Buffer): WebSocketMessage {
  try {
    const text = typeof data === 'string' ? data : data.toString('utf8');
    const parsed = JSON.parse(text);

    // Validate message structure
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Message must be an object');
    }

    if (!parsed.type) {
      throw new Error('Message must have a type field');
    }

    const validTypes = ['request', 'response', 'event', 'error'];
    if (!validTypes.includes(parsed.type)) {
      throw new Error(`Invalid message type: ${parsed.type}`);
    }

    // Type-specific validation
    if (parsed.type === 'request' && !parsed.id) {
      throw new Error('Request must have an id field');
    }

    if (parsed.type === 'response' && !parsed.id) {
      throw new Error('Response must have an id field');
    }

    return parsed as WebSocketMessage;
  } catch (error) {
    throw new Error(`Invalid WebSocket message: ${(error as Error).message}`);
  }
}

/**
 * Format response message
 */
export function formatResponse(requestId: string, payload: any, success: boolean = true): string {
  const message: WebSocketMessage = {
    type: 'response',
    id: requestId,
    success,
    payload,
  };

  return JSON.stringify(message);
}

/**
 * Format event message
 */
export function formatEvent(channel: string, event: string, payload: any, id?: string): string {
  const message: WebSocketMessage = {
    type: 'event',
    channel,
    event,
    payload,
  };

  if (id) {
    message.id = id;
  }

  return JSON.stringify(message);
}

/**
 * Format error message
 */
export function formatError(
  code: string,
  errorMessage: string,
  requestId?: string,
  details?: any
): string {
  const message: WebSocketMessage = {
    type: 'error',
    error: {
      code,
      message: errorMessage,
      details,
    },
  };

  if (requestId) {
    message.id = requestId;
  }

  return JSON.stringify(message);
}

/**
 * Message validator
 */
export class MessageValidator {
  /**
   * Validate request message
   */
  validateRequest(message: WebSocketMessage): { valid: boolean; error?: string } {
    if (message.type !== 'request') {
      return { valid: false, error: 'Not a request message' };
    }

    if (!message.id) {
      return { valid: false, error: 'Missing id field' };
    }

    if (!message.channel) {
      return { valid: false, error: 'Missing channel field' };
    }

    if (!message.action) {
      return { valid: false, error: 'Missing action field' };
    }

    return { valid: true };
  }

  /**
   * Validate response message
   */
  validateResponse(message: WebSocketMessage): { valid: boolean; error?: string } {
    if (message.type !== 'response') {
      return { valid: false, error: 'Not a response message' };
    }

    if (!message.id) {
      return { valid: false, error: 'Missing id field' };
    }

    if (message.success === undefined) {
      return { valid: false, error: 'Missing success field' };
    }

    return { valid: true };
  }

  /**
   * Validate event message
   */
  validateEvent(message: WebSocketMessage): { valid: boolean; error?: string } {
    if (message.type !== 'event') {
      return { valid: false, error: 'Not an event message' };
    }

    if (!message.event) {
      return { valid: false, error: 'Missing event field' };
    }

    return { valid: true };
  }
}

/**
 * Message router
 */
export class MessageRouter {
  private handlers = new Map<string, Map<string, Function>>();

  /**
   * Register handler for channel + action
   */
  on(channel: string, action: string, handler: Function): void {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Map());
    }

    this.handlers.get(channel)!.set(action, handler);
  }

  /**
   * Route message to handler
   */
  async route(message: WebSocketMessage, context: any): Promise<any> {
    if (!message.channel || !message.action) {
      throw new Error('Message missing channel or action');
    }

    const channelHandlers = this.handlers.get(message.channel);
    if (!channelHandlers) {
      throw new Error(`No handlers for channel: ${message.channel}`);
    }

    const handler = channelHandlers.get(message.action);
    if (!handler) {
      throw new Error(`No handler for action: ${message.action} on channel: ${message.channel}`);
    }

    return await handler(message.payload, context);
  }

  /**
   * Check if handler exists
   */
  hasHandler(channel: string, action: string): boolean {
    const channelHandlers = this.handlers.get(channel);
    return channelHandlers?.has(action) ?? false;
  }

  /**
   * Get all registered channels
   */
  getChannels(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers.clear();
  }
}

/**
 * Factory functions
 */
export function createMessageValidator(): MessageValidator {
  return new MessageValidator();
}

export function createMessageRouter(): MessageRouter {
  return new MessageRouter();
}
