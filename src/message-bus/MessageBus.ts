/**
 * MessageBus - Central event bus for inter-module communication
 * 
 * Features:
 * - Pub/sub pattern with typed events
 * - Wildcard subscriptions (tool.*, session.*, *)
 * - Middleware pipeline
 * - Handler priorities
 * - Async handling
 * - Comprehensive error handling
 */

import type {
  EventHandler,
  EventMiddleware,
  SubscribeOptions,
  UnsubscribeFn,
  EventPayloadMap,
  ErrorHandler,
  ListenerEntry,
} from './types';

export class MessageBus<Events extends EventPayloadMap = EventPayloadMap> {
  /** Exact event matches */
  private exactListeners: Map<string, ListenerEntry[]> = new Map();
  
  /** Wildcard pattern listeners */
  private wildcardListeners: ListenerEntry[] = [];
  
  /** Middleware stack */
  private middlewares: EventMiddleware[] = [];
  
  /** Error handler */
  private errorHandler?: ErrorHandler;
  
  /** Track if we're currently emitting (to handle subscribe/unsubscribe during emit) */
  private emitting = false;

  /**
   * Subscribe to an event
   * @param event - Event name or wildcard pattern
   * @param handler - Event handler function
   * @param options - Subscribe options (priority, once)
   * @returns Unsubscribe function
   */
  on<K extends keyof Events>(
    event: K | string,
    handler: EventHandler<Events[K]>,
    options: SubscribeOptions = {}
  ): UnsubscribeFn {
    const { priority = 0, once = false } = options;
    const eventStr = event as string;
    
    const entry: ListenerEntry<Events[K]> = {
      handler,
      priority,
      once,
      pattern: eventStr,
    };

    if (this.isWildcard(eventStr)) {
      // Add to wildcard listeners
      this.wildcardListeners.push(entry);
      this.wildcardListeners.sort((a, b) => b.priority - a.priority);
    } else {
      // Add to exact match listeners
      if (!this.exactListeners.has(eventStr)) {
        this.exactListeners.set(eventStr, []);
      }
      const listeners = this.exactListeners.get(eventStr)!;
      listeners.push(entry);
      listeners.sort((a, b) => b.priority - a.priority);
    }

    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  /**
   * Unsubscribe from an event
   * @param event - Event name or pattern
   * @param handler - Handler to remove
   */
  off<K extends keyof Events>(
    event: K | string,
    handler: EventHandler<Events[K]>
  ): void {
    const eventStr = event as string;

    if (this.isWildcard(eventStr)) {
      // Remove from wildcard listeners
      const index = this.wildcardListeners.findIndex(
        entry => entry.handler === handler && entry.pattern === eventStr
      );
      if (index !== -1) {
        this.wildcardListeners.splice(index, 1);
      }
    } else {
      // Remove from exact listeners
      const listeners = this.exactListeners.get(eventStr);
      if (listeners) {
        const index = listeners.findIndex(entry => entry.handler === handler);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
        // Clean up empty arrays
        if (listeners.length === 0) {
          this.exactListeners.delete(eventStr);
        }
      }
    }
  }

  /**
   * Subscribe to event once (auto-unsubscribe after first trigger)
   * @param event - Event name
   * @param handler - Event handler
   * @param options - Subscribe options
   */
  once<K extends keyof Events>(
    event: K | string,
    handler: EventHandler<Events[K]>,
    options: SubscribeOptions = {}
  ): UnsubscribeFn {
    return this.on(event, handler, { ...options, once: true });
  }

  /**
   * Emit an event asynchronously
   * @param event - Event name
   * @param payload - Event payload
   * @returns Promise that resolves when all handlers complete
   */
  async emit<K extends keyof Events>(
    event: K | string,
    payload: Events[K]
  ): Promise<void> {
    const eventStr = event as string;
    
    // Run middleware pipeline with handler execution
    await this.runMiddlewareAndHandlers(eventStr, payload);
  }

  /**
   * Run middleware pipeline and then handlers
   */
  private async runMiddlewareAndHandlers(event: string, payload: any): Promise<void> {
    let index = 0;

    const executeHandlers = async (): Promise<void> => {
      // Get all matching listeners
      const listeners = this.getMatchingListeners(event);
      
      // Track which listeners to remove (once handlers)
      const toRemove: ListenerEntry[] = [];

      // Execute handlers
      const promises: Promise<void>[] = [];
      
      for (const entry of listeners) {
        try {
          const result = entry.handler(payload);
          if (result instanceof Promise) {
            promises.push(
              result.catch(error => this.handleError(error, event, payload))
            );
          }
          
          // Mark for removal even if handler throws
          if (entry.once) {
            toRemove.push(entry);
          }
        } catch (error) {
          this.handleError(error as Error, event, payload);
          
          // Still remove once handler if it threw
          if (entry.once && !toRemove.includes(entry)) {
            toRemove.push(entry);
          }
        }
      }

      // Wait for all async handlers
      await Promise.all(promises);

      // Remove once handlers
      for (const entry of toRemove) {
        this.off(entry.pattern, entry.handler);
      }
    };

    const next = async (): Promise<void> => {
      if (index >= this.middlewares.length) {
        // End of middleware chain - execute handlers
        await executeHandlers();
        return;
      }

      const middleware = this.middlewares[index++];
      await middleware(event, payload, next);
    };

    // Start middleware chain (or directly execute handlers if no middleware)
    try {
      await next();
    } catch (error) {
      // Middleware threw an error - stop processing
      // (don't execute handlers)
    }
  }

  /**
   * Emit event synchronously (doesn't wait for async handlers)
   * @param event - Event name
   * @param payload - Event payload
   */
  emitSync<K extends keyof Events>(
    event: K | string,
    payload: Events[K]
  ): void {
    const eventStr = event as string;
    
    // Note: Middleware is skipped in sync mode for simplicity
    // You could add sync middleware support if needed
    
    const listeners = this.getMatchingListeners(eventStr);
    const toRemove: ListenerEntry[] = [];

    for (const entry of listeners) {
      try {
        entry.handler(payload);
        if (entry.once) {
          toRemove.push(entry);
        }
      } catch (error) {
        this.handleError(error as Error, eventStr, payload);
      }
    }

    // Remove once handlers
    for (const entry of toRemove) {
      this.off(entry.pattern as K, entry.handler);
    }
  }

  /**
   * Add middleware to the pipeline
   * @param middleware - Middleware function
   */
  use(middleware: EventMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Set global error handler
   * @param handler - Error handler function
   */
  onError(handler: ErrorHandler): void {
    this.errorHandler = handler;
  }

  /**
   * Get count of listeners for an event
   * @param event - Event name or pattern
   */
  listenerCount(event: string): number {
    if (this.isWildcard(event)) {
      return this.wildcardListeners.filter(l => l.pattern === event).length;
    }
    return this.exactListeners.get(event)?.length || 0;
  }

  /**
   * Get all event names that have listeners
   */
  eventNames(): string[] {
    const names = Array.from(this.exactListeners.keys());
    const patterns = this.wildcardListeners.map(l => l.pattern);
    return [...names, ...patterns];
  }

  /**
   * Remove all listeners for an event (or all events if not specified)
   * WARNING: Use carefully, mainly for tests
   * @param event - Event name (optional)
   */
  removeAllListeners(event?: string): void {
    if (event === undefined) {
      this.exactListeners.clear();
      this.wildcardListeners = [];
    } else if (this.isWildcard(event)) {
      this.wildcardListeners = this.wildcardListeners.filter(
        l => l.pattern !== event
      );
    } else {
      this.exactListeners.delete(event);
    }
  }

  /**
   * Check if pattern is a wildcard
   */
  private isWildcard(pattern: string): boolean {
    return pattern.includes('*');
  }

  /**
   * Check if event matches pattern
   */
  private matchesPattern(event: string, pattern: string): boolean {
    if (pattern === '*') {
      return true; // Match all events
    }

    if (!pattern.includes('*')) {
      return event === pattern; // Exact match
    }

    // Handle patterns like "tool.*" (one level)
    const regexPattern = pattern
      .replace(/\./g, '\\.') // Escape dots
      .replace(/\*/g, '[^.]+'); // * matches anything except dots (one level)

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(event);
  }

  /**
   * Get all listeners matching the event
   */
  private getMatchingListeners(event: string): ListenerEntry[] {
    const listeners: ListenerEntry[] = [];

    // Add exact match listeners
    const exact = this.exactListeners.get(event);
    if (exact) {
      listeners.push(...exact);
    }

    // Add matching wildcard listeners
    for (const entry of this.wildcardListeners) {
      if (this.matchesPattern(event, entry.pattern)) {
        listeners.push(entry);
      }
    }

    // Sort by priority (already sorted within groups, but merge them)
    listeners.sort((a, b) => b.priority - a.priority);

    return listeners;
  }

  /**
   * Handle errors from handlers
   */
  private handleError(error: Error, event: string, payload: any): void {
    if (this.errorHandler) {
      try {
        this.errorHandler(error, event, payload);
      } catch (handlerError) {
        // Error handler itself failed - log to console
        console.error('Error in error handler:', handlerError);
        console.error('Original error:', error);
      }
    } else {
      // No error handler - log to console
      console.error(`Error in event handler for "${event}":`, error);
    }
  }
}
