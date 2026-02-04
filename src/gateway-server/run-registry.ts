/**
 * Run Registry
 *
 * Keeps track of AgentLoop runs and multiplexes a run's single event stream
 * into multiple subscribers (e.g. many SSE clients).
 */

import type { AgentEvent, RunHandle } from '../agent-loop/types';

class AsyncQueue<T> implements AsyncIterable<T> {
  private buffer: T[] = [];
  private resolvers: Array<(value: IteratorResult<T>) => void> = [];
  private closed = false;

  push(item: T): void {
    if (this.closed) return;

    const resolver = this.resolvers.shift();
    if (resolver) {
      resolver({ value: item, done: false });
      return;
    }

    this.buffer.push(item);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;

    while (this.resolvers.length > 0) {
      const resolver = this.resolvers.shift()!;
      resolver({ value: undefined as unknown as T, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.buffer.length > 0) {
          const value = this.buffer.shift()!;
          return Promise.resolve({ value, done: false });
        }

        if (this.closed) {
          return Promise.resolve({ value: undefined as unknown as T, done: true });
        }

        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolvers.push(resolve);
        });
      },
    };
  }
}

export interface RunRegistryOptions {
  /** How many events to keep in memory for late subscribers */
  bufferSize?: number;

  /** How long to retain a completed run in memory (ms) */
  retentionMs?: number;
}

export interface BufferedAgentEvent {
  id: number;
  event: AgentEvent;
}

export interface RunInfo {
  runId: string;
  sessionId: string;
  done: boolean;
  nextEventId: number;
  buffered: {
    size: number;
    firstId: number | null;
    lastId: number | null;
  };
}

export interface RunSubscriptionWithIds {
  stream: AsyncIterable<BufferedAgentEvent>;
  unsubscribe: () => void;
}

interface RunEntry {
  handle: RunHandle;
  subscribers: Set<AsyncQueue<BufferedAgentEvent>>;
  buffer: BufferedAgentEvent[];
  consuming: boolean;
  done: boolean;
  retentionTimer: NodeJS.Timeout | null;
  nextEventId: number;
}

export class RunRegistry {
  private readonly runs = new Map<string, RunEntry>();
  private readonly bufferSize: number;
  private readonly retentionMs: number;

  constructor(options: RunRegistryOptions = {}) {
    this.bufferSize = options.bufferSize ?? 200;
    this.retentionMs = options.retentionMs ?? 10 * 60_000;
  }

  register(handle: RunHandle): void {
    if (this.runs.has(handle.runId)) return;

    this.runs.set(handle.runId, {
      handle,
      subscribers: new Set(),
      buffer: [],
      consuming: false,
      done: false,
      retentionTimer: null,
      nextEventId: 0,
    });

    this.startConsuming(handle.runId);
  }

  has(runId: string): boolean {
    return this.runs.has(runId);
  }

  getStats(): { trackedRuns: number } {
    return { trackedRuns: this.runs.size };
  }

  get(runId: string): RunHandle | null {
    return this.runs.get(runId)?.handle ?? null;
  }

  getInfo(runId: string): RunInfo | null {
    const entry = this.runs.get(runId);
    if (!entry) return null;

    const first = entry.buffer.length > 0 ? entry.buffer[0]!.id : null;
    const last = entry.buffer.length > 0 ? entry.buffer[entry.buffer.length - 1]!.id : null;

    return {
      runId: entry.handle.runId,
      sessionId: entry.handle.sessionId,
      done: entry.done,
      nextEventId: entry.nextEventId,
      buffered: {
        size: entry.buffer.length,
        firstId: first,
        lastId: last,
      },
    };
  }

  cancel(runId: string): boolean {
    const entry = this.runs.get(runId);
    if (!entry) return false;
    entry.handle.cancel();
    return true;
  }

  subscribe(runId: string): AsyncIterable<AgentEvent> | null {
    const stream = this.subscribeWithIds(runId);
    if (!stream) return null;

    const nonNullStream = stream;

    async function* unwrap(): AsyncIterable<AgentEvent> {
      for await (const item of nonNullStream) {
        yield item.event;
      }
    }

    return unwrap();
  }

  /**
   * Subscribe to a run's events with stable incremental IDs.
   * If afterId is provided, replays only events with id > afterId.
   */
  subscribeWithIds(runId: string, afterId?: number): AsyncIterable<BufferedAgentEvent> | null {
    const sub = this.subscribeWithIdsHandle(runId, afterId);
    return sub?.stream ?? null;
  }

  subscribeWithIdsHandle(runId: string, afterId?: number): RunSubscriptionWithIds | null {
    const entry = this.runs.get(runId);
    if (!entry) return null;

    const queue = new AsyncQueue<BufferedAgentEvent>();
    entry.subscribers.add(queue);

    // Replay buffer to late subscriber
    for (const item of entry.buffer) {
      if (typeof afterId === 'number' && Number.isFinite(afterId) && item.id <= afterId) {
        continue;
      }
      queue.push(item);
    }

    if (entry.done) {
      queue.close();
    }

    const unsubscribe = () => {
      const current = this.runs.get(runId);
      if (!current) {
        queue.close();
        return;
      }

      current.subscribers.delete(queue);
      queue.close();
    };

    return { stream: queue, unsubscribe };
  }

  private startConsuming(runId: string): void {
    const entry = this.runs.get(runId);
    if (!entry || entry.consuming) return;
    entry.consuming = true;

    (async () => {
      try {
        for await (const event of entry.handle.events) {
          const item: BufferedAgentEvent = {
            id: (entry.nextEventId += 1),
            event,
          };

          entry.buffer.push(item);
          if (entry.buffer.length > this.bufferSize) {
            entry.buffer.splice(0, entry.buffer.length - this.bufferSize);
          }

          for (const subscriber of entry.subscribers) {
            subscriber.push(item);
          }
        }
      } finally {
        entry.done = true;
        for (const subscriber of entry.subscribers) {
          subscriber.close();
        }

        // Retain for a short time to allow clients to fetch completion.
        entry.retentionTimer = setTimeout(() => {
          this.delete(runId);
        }, this.retentionMs);
        entry.retentionTimer.unref?.();
      }
    })().catch(() => {
      // Should never throw out of background task.
    });
  }

  private delete(runId: string): void {
    const entry = this.runs.get(runId);
    if (!entry) return;
    if (entry.retentionTimer) {
      clearTimeout(entry.retentionTimer);
      entry.retentionTimer = null;
    }

    for (const subscriber of entry.subscribers) {
      subscriber.close();
    }

    this.runs.delete(runId);
  }
}
