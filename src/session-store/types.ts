/**
 * Session Store - Type Definitions
 */

/**
 * Message types
 */
export type MessageType =
  | 'system'       // System prompt
  | 'user'         // User message
  | 'assistant'    // Assistant response
  | 'tool_call'    // Tool invocation
  | 'tool_result'  // Tool result
  | 'compaction'   // Summary after compaction
  | 'custom';      // For extensions

/**
 * Message role
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * Content block (for structured content)
 */
export interface ContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

/**
 * Tool call structure
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool result structure
 */
export interface ToolResult {
  toolCallId: string;
  result: unknown;
  error?: string;
}

/**
 * Message structure
 */
export interface Message {
  id: string;
  parentId: string | null;
  type: MessageType;
  timestamp: number; // Milliseconds since epoch
  
  // Content (depends on type)
  role?: MessageRole;
  content?: string | ContentBlock[];
  toolCalls?: ToolCall[];
  toolResult?: ToolResult;
  
  // Metadata
  metadata?: Record<string, unknown>;
}

/**
 * Model overrides
 */
export interface ModelOverrides {
  model?: string;
  thinkingLevel?: 'low' | 'medium' | 'high';
  verbose?: boolean;
  temperature?: number;
  maxTokens?: number;
  [key: string]: unknown;
}

/**
 * Session metadata (stored in index)
 */
export interface SessionMetadata {
  sessionId: string;
  userId?: string;  // User ID for profile access (telegram:xxx, cli-session-xxx)
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  tokenEstimate?: number;
  modelOverrides?: ModelOverrides;
  metadata?: Record<string, unknown>;
}

/**
 * Full session structure
 */
export interface Session extends SessionMetadata {
  id: string;
  messages: Message[];
  activeBranchLeafId?: string;
}

/**
 * Branch information
 */
export interface Branch {
  name: string;
  leafMessageId: string;
  createdAt: number;
  path: string[];  // Array of message IDs
}

/**
 * Session index structure (sessions.json)
 */
export interface SessionIndex {
  keys: {
    [sessionKey: string]: string; // sessionKey -> sessionId
  };
  sessions: {
    [sessionId: string]: SessionMetadata;
  };
}

/**
 * Auto-reset configuration
 */
export interface AutoResetConfig {
  enabled: boolean;
  maxMessages?: number;
  maxAgeMs?: number;
  maxTokens?: number;
  tokenCounter?: (message: Message) => number;
  keepStrategy?: 'none' | 'first' | 'last' | 'system';
  keepCount?: number;
  insertResetMarker?: boolean;
}

/**
 * Session Store configuration
 */
export interface SessionStoreConfig {
  storageDir: string;
  indexSaveDelayMs?: number;
  lockTimeoutMs?: number;
  autoReset?: AutoResetConfig;
}

/**
 * Lock interface
 */
export interface Lock {
  sessionId: string;
  ownerId: string;
  acquiredAt: number;
}

/**
 * Session key (alias for string)
 */
export type SessionKey = string;
