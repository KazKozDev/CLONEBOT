/**
 * Context Assembler Module
 * 
 * Assembles context for model invocation from multiple sources.
 */

// Types
export type {
  ContentBlock,
  TextBlock,
  ImageBlock,
  ToolUseBlock,
  ToolResultBlock,
  SessionMessage,
  ModelMessage,
  ToolDefinition,
  ModelParameters,
  ModelLimits,
  AssemblyOptions,
  TokenBreakdown,
  TruncationInfo,
  AssemblyMetadata,
  AssembledContext,
  CompactionCheck,
  SessionStats,
  BootstrapFiles,
  SystemPromptSection,
  SystemPromptOptions,
  ToolCollectionOptions,
  ContextAssemblerConfig,
  Skill,
  SkillProvider,
  SessionStore,
  ToolExecutor,
  ContextAssemblerDependencies,
} from './types';

// Token Estimator
export {
  TokenEstimator,
  createTokenEstimator,
} from './token-estimator';
export type { TokenEstimationMode, TokenEstimatorOptions } from './token-estimator';

// Model Limits
export {
  MODEL_LIMITS,
  DEFAULT_MODEL_LIMITS,
  getModelLimits,
  supportsFeature,
  getRecommendedMaxContext,
  getMaxOutput,
  getTokenizer,
  listSupportedModels,
  isKnownModel,
} from './model-limits';

// Bootstrap Loader
export {
  BootstrapFileLoader,
  createBootstrapLoader,
} from './bootstrap-loader';
export type { BootstrapLoaderOptions } from './bootstrap-loader';

// System Prompt Builder
export {
  SystemPromptBuilder,
  createSystemPromptBuilder,
} from './system-prompt-builder';

// Message Transformer
export {
  MessageTransformer,
  createMessageTransformer,
} from './message-transformer';

// Tool Collector
export {
  ToolCollector,
  createToolCollector,
} from './tool-collector';

// Truncation
export {
  ContextTruncator,
  createContextTruncator,
} from './truncation';
export type { TruncationStrategy, TruncationOptions } from './truncation';

// Defaults Resolution
export {
  DefaultsResolver,
  createDefaultsResolver,
} from './defaults';

// Compaction Detection
export {
  CompactionDetector,
  createCompactionDetector,
} from './compaction';

// Caching
export {
  Cache,
  AssemblyCache,
  createCache,
  createAssemblyCache,
} from './cache';
export type { CacheEntry, CacheStats } from './cache';

// Skills Integration
export {
  SkillsIntegrator,
  createSkillsIntegrator,
} from './skills-integration';

// Assembler
export {
  Assembler,
  createAssembler,
} from './assembler';

// Main Facade
export {
  ContextAssembler,
  createContextAssembler,
  DEFAULT_CONFIG,
} from './ContextAssembler';
