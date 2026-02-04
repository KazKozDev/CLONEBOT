/**
 * Context Assembler Types
 * 
 * Types for assembling context before model invocation.
 */

import type { MemoryStore } from '../memory-store';
import type { UserProfileStore } from '../user-profile';

// ============================================================================
// Content Blocks
// ============================================================================

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ImageBlock {
  type: 'image';
  source: {
    type: 'base64' | 'url';
    data: string;
    mediaType?: string;
  };
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock;

// ============================================================================
// Messages
// ============================================================================

/**
 * Internal session message format
 */
export interface SessionMessage {
  id: string;
  parentId: string | null;
  type: 'system' | 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'compaction' | 'custom';
  content?: string | any[];
  timestamp: number | string;
  metadata?: {
    modelRole?: 'system' | 'user' | 'assistant';
    important?: boolean;
    toolCallIds?: string[];
    [key: string]: unknown;
  };
}

/**
 * Model message format (for API calls)
 */
export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentBlock[];
}

// ============================================================================
// Tool Definitions (from Tool Executor)
// ============================================================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  metadata?: {
    category?: string;
    permissions?: string[];
    [key: string]: unknown;
  };
}

// ============================================================================
// Model Parameters
// ============================================================================

export interface ModelParameters {
  modelId: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  thinkingLevel?: 'low' | 'medium' | 'high';
  thinkingBudget?: number;
  stopSequences?: string[];
}

// ============================================================================
// Model Limits
// ============================================================================

export interface ModelLimits {
  contextWindow: number;
  maxOutput: number;
  recommendedMaxContext: number;
  supportsSystemPrompt: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsThinking: boolean;
  tokenizer?: string;
}

// ============================================================================
// Assembly Options
// ============================================================================

export interface AssemblyOptions {
  // Model overrides
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  thinkingLevel?: 'low' | 'medium' | 'high';
  thinkingBudget?: number;

  // System prompt additions
  additionalSystemPrompt?: string;

  // Tools
  additionalTools?: ToolDefinition[];
  disabledTools?: string[];

  // Context control
  maxContextTokens?: number;
  reserveTokens?: number;

  // Skills
  skipSkills?: boolean;
  skillFilter?: string[];

  // User Profile
  userId?: string; // For loading user profile context

  // Sandbox
  sandboxMode?: boolean;

  // Permissions
  permissions?: string[];
}

// ============================================================================
// Assembled Context
// ============================================================================

export interface TokenBreakdown {
  systemPrompt: number;
  messages: number;
  tools: number;
  total: number;
}

export interface TruncationInfo {
  strategy: 'simple' | 'smart' | 'sliding';
  removedCount: number;
  removedTokens: number;
  originalTokens: number;
  finalTokens: number;
}

export interface AssemblyMetadata {
  sessionId: string;
  modelId: string;
  tokenEstimate: TokenBreakdown;
  truncated: boolean;
  truncationInfo?: TruncationInfo;
  shouldCompact: boolean;
  compactionReason?: string;
  activeSkills: string[];
  assemblyTime: number;
}

export interface AssembledContext {
  systemPrompt: string;
  messages: ModelMessage[];
  tools: ToolDefinition[];
  parameters: ModelParameters;
  metadata: AssemblyMetadata;
}

// ============================================================================
// Compaction
// ============================================================================

export interface CompactionCheck {
  needed: boolean;
  reason: 'token_limit' | 'message_count' | 'tool_count' | 'explicit' | 'none';
  currentTokens: number;
  threshold: number;
  currentMessages: number;
  messageThreshold: number;
}

export interface SessionStats {
  messageCount: number;
  tokenCount: number;
  toolCallCount: number;
  lastCompactionAt?: string;
}

// ============================================================================
// Bootstrap Files
// ============================================================================

export interface BootstrapFiles {
  agent?: string;
  soul?: string;
  context?: string;
  [key: string]: string | undefined;
}

// ============================================================================
// System Prompt Sections
// ============================================================================

export interface SystemPromptSection {
  name: string;
  content: string;
  priority: number;
}

export interface SystemPromptOptions {
  agentId?: string;
  skills?: string[];
  additionalContext?: string;
  includeDatetime?: boolean;
  datetimeFormat?: string;
  datetimeTimezone?: string;
}

// ============================================================================
// Tool Collection
// ============================================================================

export interface ToolCollectionOptions {
  agentId?: string;
  skills?: string[];
  permissions?: string[];
  sandboxMode?: boolean;
  sandboxAllowlist?: string[];
  sandboxDenylist?: string[];
  exclude?: string[];
  modelId?: string;
}

// ============================================================================
// Configuration
// ============================================================================

export interface ContextAssemblerConfig {
  // Paths
  bootstrapPath?: string;

  // Defaults
  defaultModel: string;
  defaultTemperature: number;
  defaultMaxTokens: number;

  // Truncation
  truncationStrategy: 'simple' | 'smart' | 'sliding';
  reserveTokensForResponse: number;

  // Compaction
  compactionThreshold: number;
  compactionMessageThreshold: number;

  // System prompt
  includeDatetime: boolean;
  datetimeFormat: string;
  datetimeTimezone: string;
  sectionSeparator: string;

  // Caching
  enableCaching: boolean;
  cacheFileTTL: number;

  // Features
  generateToolsSummary: boolean;
  includeExamplesInPrompt: boolean;
}

// ============================================================================
// Skills Integration Interface
// ============================================================================

export interface Skill {
  id: string;
  name: string;
  instructions?: string;
  tools?: ToolDefinition[];
  examples?: string[];
  priority?: number;
}

export interface SkillProvider {
  getActiveSkills(agentId: string, sessionId?: string): Promise<Skill[]>;
  getSkillInstructions(skillId: string): Promise<string | null>;
  getSkillTools(skillId: string): Promise<ToolDefinition[]>;
  getSkillPriority(skillId: string): Promise<number>;
}

// ============================================================================
// Dependencies
// ============================================================================

export interface SessionStore {
  getMessages(sessionId: string): Promise<SessionMessage[]>;
  getMetadata(sessionId: string): Promise<any> | any;
}

export interface ToolExecutor {
  list(options?: { category?: string }): ToolDefinition[];
  getForModel(options?: { sandboxMode?: boolean }): ToolDefinition[];
}

export interface ContextAssemblerDependencies {
  sessionStore: SessionStore;
  toolExecutor: ToolExecutor;
  skillProvider?: SkillProvider;
  memoryStore?: MemoryStore;
  userProfileStore?: UserProfileStore;
}
