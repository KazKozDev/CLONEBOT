/**
 * Agent Loop Types
 */

import type { AssembledContext } from '../context-assembler/types';
import type { ContentBlock } from '../session-store/types';
import type { MemoryStore } from '../memory-store';

// Re-export as ContextData for internal use
export type ContextData = AssembledContext;

// ============================================================================
// Run States
// ============================================================================

export type RunState =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

export type StopReason =
  | 'stop'
  | 'max_turns'
  | 'max_tool_rounds'
  | 'timeout'
  | 'cancelled'
  | 'error';

// ============================================================================
// Run Request & Options
// ============================================================================

export interface RunRequest {
  message: string | ContentBlock[];
  sessionId?: string;
  priority?: number;
  contextOptions?: Record<string, unknown>;
}

export interface RunOptions {
  maxConcurrentRuns?: number;
  maxTurns?: number;
  maxToolRounds?: number;
  retry?: Partial<RetryConfig>;
}

// ============================================================================
// Run Handle & Result
// ============================================================================

export interface RunHandle {
  runId: string;
  sessionId: string;
  state: RunState;
  events: AsyncIterable<AgentEvent>;
  cancel: () => void;
}

export interface RunResult {
  runId: string;
  sessionId: string;
  state: RunState;
  stopReason: StopReason;
  message?: string;
  usage?: any;
  context: RunContext;
}

// ============================================================================
// Events
// ============================================================================

export type AgentEvent =
  | { type: 'run.queued'; runId: string; position: number }
  | { type: 'run.started'; runId: string }
  | { type: 'run.completed'; runId: string; result: RunResult }
  | { type: 'run.error'; runId: string; error: string }
  | { type: 'run.cancelled'; runId: string; reason: string }
  | { type: 'context.start' }
  | { type: 'context.complete'; context: ContextData }
  | { type: 'model.start' }
  | { type: 'model.delta'; delta: string }
  | { type: 'model.thinking'; delta: string }
  | { type: 'model.complete'; response: ModelResponse }
  | { type: 'tool.start'; toolCallId: string; toolName: string; arguments: Record<string, unknown> }
  | { type: 'tool.complete'; toolCallId: string; result: ToolResult }
  | { type: 'tool.error'; toolCallId: string; error: string };

// ============================================================================
// Tool Calls & Results
// ============================================================================

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status?: 'pending' | 'running' | 'completed' | 'failed';
}

export interface ToolResult {
  toolCallId: string;
  result: unknown;
  error?: string;
}

export interface ModelResponse {
  id: string;
  content: string | null;
  finishReason: string;
  usage?: any;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

// ============================================================================
// Queue
// ============================================================================

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

// ============================================================================
// Run Context
// ============================================================================

export interface RunContext {
  runId: string;
  sessionId: string;
  startedAt: number;
  completedAt?: number;
  session?: any;
  context?: ContextData;
  turns: TurnStats;
  metrics: {
    contextAssembly: { duration: number };
    modelCalls: Array<{ duration: number; tokens: { prompt: number; completion: number } }>;
    toolExecutions: Array<{ duration: number; toolName: string; success: boolean }>;
    persistence: { duration: number };
    total: { duration: number };
  };
}

// ============================================================================
// Configuration
// ============================================================================

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

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface AgentLoopStats {
  runs: {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    timeout: number;
  };
  timing: {
    avgDuration: number;
    p50: number;
    p95: number;
    p99: number;
  };
  tokens: {
    totalInput: number;
    totalOutput: number;
  };
  tools: {
    totalCalls: number;
    byTool: Map<string, number>;
  };
  queue: {
    avgWaitTime: number;
    maxWaitTime: number;
  };
  errors: {
    total: number;
    byType: Map<string, number>;
  };
}

// ============================================================================
// Hooks
// ============================================================================

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

// ============================================================================
// Dependencies
// ============================================================================

import type { SessionStore } from '../session-store';
import type { ContextAssembler } from '../context-assembler';
import type { ToolExecutor } from '../tool-executor';
import type { ModelAdapter } from '../model-adapter';

export interface AgentLoopDependencies {
  sessionStore: SessionStore;
  contextAssembler: ContextAssembler;
  modelAdapter: ModelAdapter;
  toolExecutor: ToolExecutor;
  memoryStore?: MemoryStore;
}
