/**
 * Tool Executor Module
 * 
 * System for registering, validating, and executing tools for AI agents.
 */

// Core types
export type {
  // JSON Schema
  PropertySchema,
  JSONSchema,
  
  // Tool Definition
  ToolDefinition,
  
  // Execution
  ExecutionContext,
  ToolResult,
  ToolHandler,
  
  // Hooks
  BeforeHook,
  AfterHook,
  ErrorHook,
  BeforeHookContext,
  AfterHookContext,
  ErrorHookContext,
  BeforeHookResult,
  
  // Registry
  RegisteredTool,
  ListOptions,
  ModelToolsOptions,
  
  // Execution Types
  ToolCall,
  ValidationError,
  ValidationResult,
  ContextOptions,
  
  // Configuration
  ToolExecutorConfig,
  
  // Statistics
  ToolStats,
  ToolRegistryStats,
  ToolIntrospection,
  
  // Standard Types
  ToolCategory,
  Permission
} from './types';

// Error classes
export {
  ToolExecutorError,
  ToolNotFoundError,
  ToolValidationError,
  ToolTimeoutError,
  ToolPermissionError,
  ToolAbortedError
} from './types';

// Main facade
export { ToolExecutor } from './ToolExecutor';

// Registry
export { ToolRegistry } from './registry';

// Validation
export { validateToolDefinition } from './validation/definition-validator';
export { validateParameters } from './validation/schema-validator';

// Context utilities
export {
  createExecutionContext,
  createChildContext,
  isContextAborted,
  createErrorResult,
  createSuccessResult,
  normalizeResult
} from './context';

// Permissions
export {
  checkPermissions,
  expandPermissions,
  isSandboxAllowed
} from './permissions';

// Compression
export { compressResult } from './compression';
export type { TruncationStrategy } from './compression';

// Hooks
export { HookManager } from './hooks/hook-manager';
export {
  createLoggingHook,
  createPermissionHook,
  createTimeoutHook,
  createCompressionHook,
  createSandboxHook,
  createErrorRecoveryHook,
  createRateLimitHook,
  createValidationHook,
  createMetricsHook,
  createStandardHooks
} from './hooks/builtin-hooks';

// Browser tools integration
export {
  registerBrowserTools,
  createBrowserToolHandlers,
  navigateTool,
  screenshotTool,
  scanTool,
  clickTool,
  typeTool,
  fillTool,
  evaluateTool,
  getCookiesTool,
  waitForNavigationTool
} from './browser-tools';
