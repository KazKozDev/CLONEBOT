// Agent event types (mirrored from gateway)
export type AgentEventType =
  | 'run.queued' | 'run.started' | 'run.completed' | 'run.error' | 'run.cancelled'
  | 'context.start' | 'context.complete'
  | 'model.start' | 'model.delta' | 'model.complete'
  | 'tool.start' | 'tool.complete' | 'tool.error';

// Chat message
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
  timestamp: number;
  toolCalls?: ToolCallDisplay[];
}

// Tool call display
export interface ToolCallDisplay {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: 'running' | 'completed' | 'error';
  result?: unknown;
  error?: string;
}

// Session info from API
export interface SessionInfo {
  sessionId: string;
  keys: string[];
  metadata: {
    sessionId: string;
    createdAt: number;
    updatedAt: number;
    messageCount: number;
  };
}

// Session message from API
export interface SessionMessage {
  id: string;
  parentId: string | null;
  type: 'system' | 'user' | 'assistant' | 'tool_call' | 'tool_result';
  timestamp: number;
  role?: 'system' | 'user' | 'assistant';
  content?: string | ContentBlock[];
  metadata?: Record<string, unknown>;
}

export interface ContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  source?: {
    type: 'base64';
    mediaType?: string;
    data: string;
  };
  [key: string]: unknown;
}

export interface ImageAttachmentPayload {
  data: string; // base64 (no data URL prefix)
  mediaType: string;
  name?: string;
}

// Health
export interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  checks: Record<string, { status: string; latency?: number; message?: string }>;
}

// Stats
export interface ServerStats {
  connections: { total: number; byType: Record<string, number> };
  runs: { active: number; completed: number; total: number };
  memory: { rss: number; heapUsed: number; heapTotal: number };
  uptime: number;
}

// Log entry
export interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  data?: unknown;
}
