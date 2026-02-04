import { API_BASE } from './constants';

export interface SSEConnection {
  close: () => void;
}

export function connectSSE(
  runId: string,
  handlers: {
    onEvent: (eventType: string, data: unknown) => void;
    onError?: (error: Event) => void;
    onOpen?: () => void;
  },
  lastEventId?: string
): SSEConnection {
  const url = `${API_BASE}/api/v1/chat/${runId}/stream`;
  const source = new EventSource(url);

  source.onopen = () => {
    handlers.onOpen?.();
  };

  source.onerror = (e) => {
    handlers.onError?.(e);
  };

  // Listen to all known event types
  const eventTypes = [
    'run.queued', 'run.started', 'run.completed', 'run.error', 'run.cancelled',
    'context.start', 'context.complete',
    'model.start', 'model.delta', 'model.complete',
    'tool.start', 'tool.complete', 'tool.error',
  ];

  for (const type of eventTypes) {
    source.addEventListener(type, (e: MessageEvent) => {
      let data: unknown;
      try {
        data = JSON.parse(e.data);
      } catch {
        data = e.data;
      }
      handlers.onEvent(type, data);
    });
  }

  // Also listen for generic "message" events
  source.onmessage = (e: MessageEvent) => {
    let data: unknown;
    try {
      data = JSON.parse(e.data);
    } catch {
      data = e.data;
    }
    handlers.onEvent('message', data);
  };

  return {
    close: () => source.close(),
  };
}
