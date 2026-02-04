/**
 * Type definitions for Message Bus
 */

/**
 * Event handler function
 */
export type EventHandler<T = any> = (payload: T) => void | Promise<void>;

/**
 * Middleware function
 * @param event - Event name
 * @param payload - Event payload
 * @param next - Call to continue the chain
 */
export type EventMiddleware = (
  event: string,
  payload: any,
  next: () => void | Promise<void>
) => void | Promise<void>;

/**
 * Subscribe options
 */
export interface SubscribeOptions {
  /** Handler priority (higher = called earlier) */
  priority?: number;
  /** Auto-unsubscribe after first trigger */
  once?: boolean;
}

/**
 * Unsubscribe function returned by on()
 */
export type UnsubscribeFn = () => void;

/**
 * Error handler callback
 */
export type ErrorHandler = (error: Error, event: string, payload: any) => void;

/**
 * Default event payload map
 * Extend this interface to add type-safe events
 * 
 * @example
 * ```typescript
 * declare module './types' {
 *   interface EventPayloadMap {
 *     'session.created': { sessionId: string; sessionKey: string };
 *     'tool.before': { toolName: string; params: unknown; runId: string };
 *   }
 * }
 * ```
 */
export interface EventPayloadMap {
  // Default - allows any event with any payload
  [event: string]: any;
}

/**
 * Internal listener entry
 */
export interface ListenerEntry<T = any> {
  handler: EventHandler<T>;
  priority: number;
  once: boolean;
  pattern: string;
}
