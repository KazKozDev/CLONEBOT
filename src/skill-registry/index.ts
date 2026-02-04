/**
 * Skill Registry Module
 * 
 * System for managing skills - extensions that add new capabilities to the agent
 */

// Types
export type {
  Skill,
  SkillInfo,
  SkillLevel,
  ParsedSkill,
  SkillFrontmatter,
  ToolDefinition,
  JSONSchema,
  PropertySchema,
  Example,
  ConfigSchema,
  ConfigParam,
  SkillConfig,
  DiscoveredSkill,
  SkillLocation,
  FileInfo,
  ScanResult,
  ScanError,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  Override,
  DependencyResult,
  UnsatisfiedDependency,
  Conflict,
  ActivationContext,
  ListOptions,
  QueryOptions,
  QueryResult,
  ClawHubSearchResult,
  ClawHubSkillInfo,
  ClawHubVersion,
  ClawHubSearchOptions,
  SkillSource,
  InstallOptions,
  SkillEvent,
  SkillEventPayload,
  FileChange
} from './types';

export { SkillRegistryError } from './types';export { ClawHubClient } from './clawhub-client';
// Core components
export { SkillParser } from './skill-parser';
export { SkillValidator } from './skill-validator';
export { DirectoryScanner, type ScanOptions } from './directory-scanner';
export { SkillLoader, type LoadResult, type BatchLoadResult } from './skill-loader';
export { SkillStore } from './skill-store';
export { PrecedenceResolver } from './precedence-resolver';
export { DependencyResolver } from './dependency-resolver';
export { TriggerMatcher, type TriggerMatch } from './trigger-matcher';
export { ActivationManager, type SessionActivation } from './activation-manager';

// Main facade
export { SkillRegistry, type SkillRegistryConfig } from './skill-registry';

// Agent Loop Integration
export { 
  AgentLoopIntegration, 
  type AgentLoopIntegrationConfig,
  type SkillActivationResult,
  type EnhancedContext
} from './agent-loop-integration';

export { 
  createContextAssemblerHook,
  SkillContextTransformer,
  IntegrationHelpers
} from './context-assembler-integration';

// File watching and configuration
export { FileWatcher, type FileWatcherConfig, type WatchEvent, type ReloadResult } from './file-watcher';
export { 
  ConfigurationManager, 
  type ConfigurationManagerConfig,
  type ConfigValidationResult
} from './configuration-manager';

// Query engine
export { 
  QueryEngine,
  type RankingWeights,
  type ScoredSkill
} from './query-engine';

// Error types
export * from './errors';

// TODO: Export when implemented
// export { ClawHubClient } from './clawhub-client.js';
// export { SkillInstaller } from './skill-installer.js';
// export { SkillInstaller } from './skill-installer.js';
// export { QueryEngine } from './query-engine.js';
// export { SkillRegistry } from './SkillRegistry.js';
