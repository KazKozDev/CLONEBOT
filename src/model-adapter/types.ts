/**
 * Model Adapter - Type Definitions
 * Unified interface for multiple model providers
 */

// ============================================================================
// Delta Types (streaming response)
// ============================================================================

export type Delta =
  | TextDelta
  | ToolUseStartDelta
  | ToolUseDelta
  | ToolUseEndDelta
  | ThinkingDelta
  | DoneDelta
  | ErrorDelta;

export interface TextDelta {
  type: 'text';
  text: string;
}

export interface ToolUseStartDelta {
  type: 'tool_use_start';
  id: string;
  name: string;
}

export interface ToolUseDelta {
  type: 'tool_use_delta';
  id: string;
  input: string;  // Partial JSON
}

export interface ToolUseEndDelta {
  type: 'tool_use_end';
  id: string;
}

export interface ThinkingDelta {
  type: 'thinking';
  text: string;
}

export interface DoneDelta {
  type: 'done';
  usage: TokenUsage;
  stopReason: StopReason;
}

export interface ErrorDelta {
  type: 'error';
  error: AdapterError;
}

// ============================================================================
// Token Usage
// ============================================================================

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;    // Anthropic prompt caching
  cacheWriteTokens?: number;   // Anthropic prompt caching
  reasoningTokens?: number;    // OpenAI o1 reasoning
}

// ============================================================================
// Stop Reason
// ============================================================================

export type StopReason =
  | 'end_turn'       // Model finished naturally
  | 'tool_use'       // Model wants to call a tool
  | 'max_tokens'     // Hit token limit
  | 'stop_sequence'  // Hit stop sequence
  | 'error';         // Error occurred

// ============================================================================
// Error Handling
// ============================================================================

export interface AdapterError {
  code: string;
  message: string;
  provider: string;
  retryable: boolean;
  statusCode?: number;
  details?: unknown;
}

// ============================================================================
// Completion Request
// ============================================================================

export interface CompletionRequest {
  // Model (required)
  model: string;  // "anthropic/claude-opus-4-5-20251124" or "opus"

  // Context
  systemPrompt?: string;
  messages: ModelMessage[];
  tools?: ToolDefinition[];

  // Generation parameters
  temperature?: number;        // 0.0 - 2.0
  maxTokens?: number;
  topP?: number;
  topK?: number;              // Anthropic, Google
  stopSequences?: string[];

  // Provider-specific features
  thinkingLevel?: 'low' | 'medium' | 'high';  // Anthropic extended thinking
  thinkingBudget?: number;                    // Anthropic thinking token budget
  jsonMode?: boolean;                         // OpenAI, Google
  jsonSchema?: object;                        // Structured output
  groundingEnabled?: boolean;                 // Google grounding

  // Options
  timeout?: number;
  signal?: AbortSignal;

  // Metadata
  user?: string;        // For tracking
  requestId?: string;   // For logs
}

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentBlock[];
}

export type ContentBlock =
  | TextContentBlock
  | ImageContentBlock
  | ToolUseContentBlock
  | ToolResultContentBlock;

export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface ImageContentBlock {
  type: 'image';
  source: ImageSource;
}

export interface ToolUseContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultContentBlock {
  type: 'tool_result';
  toolUseId: string;
  content: string | (TextContentBlock | ImageContentBlock)[];
  isError?: boolean;
}

export interface ImageSource {
  type: 'base64' | 'url';
  mediaType?: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  data?: string;  // base64
  url?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: object;  // JSON Schema
}

// ============================================================================
// Model Operations
// ============================================================================

export interface ResolvedModel {
  provider: string;
  model: string;
  fullId: string;  // "anthropic/claude-opus-4-5-20251124"
}

export interface ListModelsOptions {
  provider?: string;
  capability?: ModelCapability;
  includeUnavailable?: boolean;
}

export type ModelCapability =
  | 'vision'
  | 'tools'
  | 'thinking'
  | 'json_mode'
  | 'streaming';

export interface ModelInfo {
  id: string;
  provider: string;
  displayName: string;
  aliases: string[];
  capabilities: ModelCapabilities;
  pricing?: ModelPricing;
  available: boolean;
}

export interface ModelCapabilities {
  contextWindow: number;
  maxOutput: number;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsThinking: boolean;
  supportsJsonMode: boolean;
  supportsStreaming: boolean;
  supportsSystemPrompt: boolean;
}

export interface ModelPricing {
  inputPer1kTokens: number;     // USD
  outputPer1kTokens: number;
  cacheReadPer1kTokens?: number;
  cacheWritePer1kTokens?: number;
}

// ============================================================================
// Provider Management
// ============================================================================

export interface ProviderInfo {
  name: string;
  displayName: string;
  type: 'cloud' | 'local';
  status: 'available' | 'unavailable' | 'unconfigured';
  models: string[];
}

export interface ProviderConfig {
  credentials: unknown;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  proxy?: string;
}

export interface GenerationParameters {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  [key: string]: unknown;  // Provider-specific params
}

// ============================================================================
// Provider Adapter Interface
// ============================================================================

export interface ProviderAdapter {
  // Identification
  name: string;
  displayName: string;
  type: 'cloud' | 'local';

  // Configuration
  configure(config: ProviderConfig): void;
  validateCredentials(): Promise<boolean>;

  // Models
  listModels(): ModelInfo[];
  getCapabilities(model: string): ModelCapabilities | null;
  supportsModel(model: string): boolean;

  // Main method
  complete(request: ProviderRequest): AsyncIterable<Delta>;

  // Health
  healthCheck(): Promise<boolean>;

  // Cleanup
  dispose(): Promise<void>;
}

export interface ProviderRequest {
  model: string;  // Just model name, no provider prefix
  systemPrompt?: string;
  messages: ProviderMessage[];
  tools?: ProviderTool[];
  parameters: GenerationParameters;
  signal?: AbortSignal;
}

export interface ProviderMessage {
  role: string;
  content: string | unknown[];
  [key: string]: unknown;  // Provider-specific fields
}

export interface ProviderTool {
  [key: string]: unknown;  // Provider-specific format
}

// ============================================================================
// Health & Stats
// ============================================================================

export interface HealthCheckResult {
  provider: string;
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  checkedAt: Date;
}

export interface AdapterStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;  // USD estimate

  byProvider: Record<string, ProviderStats>;
  byModel: Record<string, ModelStats>;

  recentErrors: AdapterError[];
  errorsByType: Record<string, number>;

  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
}

export interface ProviderStats {
  requests: number;
  tokens: { input: number; output: number };
  cost: number;
  errors: number;
  averageLatencyMs: number;
}

export interface ModelStats {
  requests: number;
  tokens: { input: number; output: number };
  cost: number;
  errors: number;
  averageLatencyMs: number;
}

// ============================================================================
// Model Adapter Configuration
// ============================================================================

export interface ModelAdapterConfig {
  // Defaults
  defaultProvider?: string;
  defaultModel?: string;

  // Retry
  retry?: RetryConfig;

  // Timeouts
  connectTimeoutMs?: number;   // default: 10000
  readTimeoutMs?: number;      // default: 300000

  // Provider configs
  providers?: {
    anthropic?: AnthropicConfig;
    openai?: OpenAIConfig;
    google?: GoogleConfig;
    ollama?: OllamaConfig;
    llamacpp?: LlamaCppConfig;
  };

  // Features
  enableUsageTracking?: boolean;
  maxRecentErrors?: number;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableStatuses: number[];
  retryableErrors: string[];
}

export interface AnthropicConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

export interface OpenAIConfig {
  apiKey?: string;
  organization?: string;
  baseUrl?: string;
  defaultModel?: string;
}

export interface GoogleConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

export interface OllamaConfig {
  baseUrl?: string;  // default: http://localhost:11434
  defaultModel?: string;
}

export interface LlamaCppConfig {
  baseUrl?: string;  // default: http://localhost:8080
}

// ============================================================================
// Model Registry Entry
// ============================================================================

export interface ModelRegistryEntry {
  provider: string;
  displayName: string;
  aliases: string[];
  capabilities: ModelCapabilities;
  pricing?: ModelPricing;
}
