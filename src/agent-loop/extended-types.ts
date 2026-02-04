// Additional exports for tests and dependencies
export interface QueueStatus {
  queued: number;
  running: number;
  capacity: number;
}

export interface SessionLock {
  sessionId: string;
  runId: string;
  acquiredAt: number;
  release: () => void;
}

export interface TurnStats {
  turns: number;
  toolRounds: number;
  maxTurns: number;
  maxToolRounds: number;
}

export interface AgentLoopConfig {
  concurrency: {
    maxConcurrentRuns: number;
    maxConcurrentToolCalls: number;
  };
  limits: {
    maxTurns: number;
    maxToolRounds: number;
    maxToolCallsPerRound: number;
    queueTimeout: number;
  };
  execution: {
    streamEvents: boolean;
    saveToSession: boolean;
  };
  retry: {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
    retryableErrors: string[];
  };
  streaming: {
    bufferSize: number;
    enableBackpressure: boolean;
  };
  persistence: {
    autoSave: boolean;
    saveInterval: number;
  };
}

export interface RunContext {
  runId: string;
  sessionId: string;
  startedAt: number;
  completedAt?: number;
  session?: any;
  context?: any;
  turns: TurnStats;
  metrics: {
    contextAssembly: { duration: number };
    modelCalls: Array<{ duration: number; tokens: { prompt: number; completion: number } }>;
    toolExecutions: Array<{ duration: number; toolName: string; success: boolean }>;
    persistence: { duration: number };
    total: { duration: number };
  };
}

export type HookName =
  | 'beforeRun'
  | 'afterContextAssembly'
  | 'beforeModelCall'
  | 'afterModelCall'
  | 'beforeToolExecution'
  | 'afterToolExecution'
  | 'afterRun'
  | 'onError';

export type HookHandler = (context: any) => Promise<void> | void;

export interface ModelResponse {
  id: string;
  content: string;
  finishReason: string;
  usage: any;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
}
