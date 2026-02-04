/**
 * Model Adapter - Public API
 */

// Main facade
export { ModelAdapter, createModelAdapter } from './ModelAdapter';

// Types
export type {
  // Delta types
  Delta,
  TextDelta,
  ToolUseStartDelta,
  ToolUseDelta,
  ToolUseEndDelta,
  ThinkingDelta,
  DoneDelta,
  ErrorDelta,

  // Request/Response
  CompletionRequest,
  ModelMessage,
  ContentBlock,
  TextContentBlock,
  ImageContentBlock,
  ToolUseContentBlock,
  ToolResultContentBlock,
  ToolDefinition,

  // Model info
  ModelInfo,
  ModelCapabilities,
  ModelPricing,
  ResolvedModel,

  // Provider
  ProviderAdapter,
  ProviderInfo,
  ProviderConfig,

  // Configuration
  ModelAdapterConfig,
  RetryConfig,
  AnthropicConfig,
  OpenAIConfig,
  GoogleConfig,
  OllamaConfig,
  LlamaCppConfig,

  // Stats
  AdapterStats,
  ProviderStats,
  ModelStats,
  TokenUsage,
  AdapterError,
  HealthCheckResult,
} from './types';

// Model resolution
export {
  resolveModel,
  tryResolveModel,
  modelExists,
  extractProvider,
  getDisplayName,
  normalizeModelId,
  isSameModel,
  getSuggestions,
} from './model-resolution';

// Model registry
export {
  MODEL_REGISTRY,
  getModelEntry,
  listAllModels,
  listModelsByProvider,
  getAliases,
  findModelByAlias,
  listProviders,
  toModelInfo,
  getAllModelInfo,
  filterByCapability,
  getCheapestModel,
  getMostCapableModel,
} from './model-registry';

// Credential manager
export { CredentialManager, getGlobalCredentialManager } from './credential-manager';

// Usage tracker
export { UsageTracker } from './usage-tracker';



// Middleware
export { withRetry, DEFAULT_RETRY_CONFIG } from './middleware/retry';
export {
  createFallbackChain,
  createAnthropicFallback,
  createOpenAIFallback,
  createCloudToLocalFallback,
  createQualityToSpeedFallback,
} from './middleware/fallback';
export type { FallbackConfig } from './middleware/fallback';

// Individual adapters (advanced usage)
export { AnthropicAdapter } from './providers/anthropic-adapter';
export { OpenAIAdapter } from './providers/openai-adapter';
export { GoogleAdapter } from './providers/google-adapter';
export { OllamaAdapter } from './providers/ollama-adapter';
export { LlamaCppAdapter } from './providers/llamacpp-adapter';
