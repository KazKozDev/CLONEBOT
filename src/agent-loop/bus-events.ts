/**
 * Agent Loop → MessageBus Bridge
 *
 * Type-safe event declarations and utility to relay
 * AgentLoop run events onto a global MessageBus.
 */

import type { MessageBus } from '../message-bus';
import type { RunHandle, RunResult, ContextData, ModelResponse, ToolResult } from './types';

// ============================================================================
// EventPayloadMap augmentation
// ============================================================================

declare module '../message-bus/types' {
  interface EventPayloadMap {
    'agent.run.queued':     { runId: string; position: number };
    'agent.run.started':    { runId: string };
    'agent.run.completed':  { runId: string; result: RunResult };
    'agent.run.error':      { runId: string; error: string };
    'agent.run.cancelled':  { runId: string; reason: string };
    'agent.context.start':    Record<string, never>;
    'agent.context.complete': { context: ContextData };
    'agent.model.start':    Record<string, never>;
    'agent.model.delta':    { delta: string };
    'agent.model.complete': { response: ModelResponse };
    'agent.tool.start':     { toolCallId: string; toolName: string; arguments: Record<string, unknown> };
    'agent.tool.complete':  { toolCallId: string; result: ToolResult };
    'agent.tool.error':     { toolCallId: string; error: string };
  }
}

// ============================================================================
// Bridge function
// ============================================================================

/**
 * Bridge a RunHandle's event stream to a MessageBus.
 *
 * Iterates the handle's events and emits each one onto the bus
 * with an "agent." prefix (e.g. model.delta → agent.model.delta).
 *
 * Returns a promise that resolves when the run completes.
 *
 * **Important:** This consumes the handle's event iterator.
 * If you also need to consume events yourself (e.g. for streaming to UI),
 * use inline emission inside your own for-await loop instead:
 *
 * ```ts
 * for await (const event of handle.events) {
 *   const { type, ...payload } = event as any;
 *   bus.emit(`agent.${type}`, payload).catch(() => {});
 *   // ... your own event handling
 * }
 * ```
 */
export function bridgeToMessageBus(
  handle: RunHandle,
  bus: MessageBus
): Promise<void> {
  return (async () => {
    for await (const event of handle.events) {
      const { type, ...payload } = event as any;
      try {
        await bus.emit(`agent.${type}`, payload);
      } catch {
        // Never let bus errors break the run consumption
      }
    }
  })();
}
