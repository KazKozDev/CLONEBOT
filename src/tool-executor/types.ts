/**
 * Module 5: Tool Registry & Executor
 * 
 * Core type definitions for the tool execution system.
 */

// ============================================================================
// JSON Schema Types
// ============================================================================

export interface PropertySchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';
  description?: string;
  default?: unknown;
  enum?: unknown[];
  items?: PropertySchema;              // For array
  properties?: Record<string, PropertySchema>;  // For object
  required?: string[];                 // For nested objects
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean;
  nullable?: boolean;                  // Allow null
}

export interface JSONSchema {
  type: 'object';
  properties: Record<string, PropertySchema>;
  required?: string[];
  additionalProperties?: boolean;
}

// ============================================================================
// Tool Definition
// ============================================================================

export interface ToolDefinition {
  // Identification
  name: string;                         // Unique name: 'read_file', 'bash', 'browser.click'
  description: string;                  // Description for the model
  
  // Parameters (JSON Schema)
  parameters: JSONSchema;
  
  // Optional
  returns?: {
    description: string;
    schema?: JSONSchema;
  };
  
  // Metadata
  metadata?: {
    category?: string;                  // 'filesystem', 'browser', 'system', 'network'
    permissions?: string[];             // Required permissions: ['fs.read', 'fs.write']
    timeout?: number;                   // Default timeout in ms
    rateLimit?: {
      requests: number;
      windowMs: number;
    };
    dangerous?: boolean;                // Requires confirmation
    cacheable?: boolean;                // Result can be cached
    streaming?: boolean;                // Supports streaming result
  };
  
  // Examples (for the model)
  examples?: {
    input: Record<string, unknown>;
    output: string;
    description?: string;
  }[];
}

// ============================================================================
// Tool Handler
// ============================================================================

export interface ExecutionContext {
  // Identification
  sessionId: string;
  userId?: string; // User ID for profile access
  runId: string;
  toolCallId: string;
  
  // Permissions
  permissions: Set<string>;
  sandboxMode: boolean;
  
  // Environment
  workingDirectory: string;
  env: Record<string, string>;
  
  // Control
  signal: AbortSignal;
  timeout: number;
  
  // Utilities
  log: (level: string, message: string, data?: unknown) => void;
  emitProgress: (progress: number, message?: string) => void;
  
  // Access to other tools (for composed tools)
  invokeTool: (name: string, params: unknown) => Promise<ToolResult>;
}

export interface ToolResult {
  // Main result
  content: string;                      // Text representation
  
  // Structured data (optional)
  data?: unknown;
  
  // Status
  success: boolean;
  
  // Error (if success: false)
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  
  // Metadata
  metadata?: {
    duration?: number;                  // Execution time ms
    truncated?: boolean;                // Result was truncated
    originalLength?: number;            // Size before truncation
    cached?: boolean;                   // From cache
  };
}

export type ToolHandler = (
  params: Record<string, unknown>,
  context: ExecutionContext
) => Promise<ToolResult> | ToolResult;

// ============================================================================
// Hooks
// ============================================================================

export interface BeforeHookContext {
  toolName: string;
  params: Record<string, unknown>;
  executionContext: ExecutionContext;
}

export type BeforeHookResult = {
  // Continue execution
  proceed: true;
  // Modified parameters (optional)
  params?: Record<string, unknown>;
} | {
  // Block execution
  proceed: false;
  reason: string;
  error?: ToolResult;
};

export interface BeforeHook {
  name: string;
  priority: number;                     // Higher = executed earlier
  handler: (context: BeforeHookContext) => Promise<BeforeHookResult> | BeforeHookResult;
}

export interface AfterHookContext {
  toolName: string;
  params: Record<string, unknown>;
  result: ToolResult;
  executionContext: ExecutionContext;
  duration: number;
}

export interface AfterHook {
  name: string;
  priority: number;
  handler: (context: AfterHookContext) => Promise<ToolResult> | ToolResult;
}

export interface ErrorHookContext {
  toolName: string;
  params: Record<string, unknown>;
  error: Error;
  executionContext: ExecutionContext;
}

export interface ErrorHook {
  name: string;
  priority: number;
  handler: (context: ErrorHookContext) => Promise<ToolResult | null> | ToolResult | null;
}

// ============================================================================
// Registry Types
// ============================================================================

export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
  registered: Date;
  executionCount: number;
  totalDuration: number;
  errorCount: number;
  lastError?: {
    message: string;
    timestamp: Date;
  };
}

export interface ListOptions {
  category?: string;
  permissions?: string[];              // Only tools with these permissions
  excludePermissions?: string[];       // Exclude tools with these permissions
  includeDangerous?: boolean;          // Include dangerous tools
  search?: string;                     // Search by name/description
}

export interface ModelToolsOptions extends ListOptions {
  sandboxMode?: boolean;               // Filter by sandbox compatibility
}

// ============================================================================
// Execution Types
// ============================================================================

export interface ToolCall {
  id: string;
  name: string;
  params: Record<string, unknown>;
}

export interface ValidationError {
  path: string;                        // 'params.location'
  message: string;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
  coerced?: Record<string, unknown>;   // Parameters after coercion
}

export interface ContextOptions {
  sessionId: string;
  runId: string;
  toolCallId: string;
  userId?: string;
  permissions?: string[];
  sandboxMode?: boolean;
  workingDirectory?: string;
  env?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
  log?: (level: string, message: string, data?: unknown) => void;
  emitProgress?: (progress: number, message?: string) => void;
}

// ============================================================================
// Configuration
// ============================================================================

export interface ToolExecutorConfig {
  // Timeouts
  defaultTimeout: number;              // default: 30000
  maxTimeout: number;                  // default: 600000
  
  // Concurrency
  maxConcurrent: number;               // default: 10
  
  // Results
  maxResultLength: number;             // default: 50000
  truncationStrategy: 'end' | 'middle' | 'smart';
  
  // Sandbox
  defaultSandboxMode: boolean;
  sandboxAllowlist: string[];          // Tools allowed in sandbox
  sandboxDenylist: string[];           // Tools forbidden in sandbox
  
  // Safety
  requireConfirmationFor: string[];    // Tools requiring confirmation
  
  // Caching
  enableCaching: boolean;
  cacheMaxAge: number;
}

// ============================================================================
// Statistics
// ============================================================================

export interface ToolStats {
  name: string;
  executionCount: number;
  errorCount: number;
  totalDuration: number;
  averageDuration: number;
  lastExecuted?: Date;
  lastError?: {
    message: string;
    timestamp: Date;
  };
}

export interface ToolRegistryStats {
  totalTools: number;
  totalExecutions: number;
  totalErrors: number;
  categories: Record<string, number>;
  mostUsed: ToolStats[];
  recentErrors: Array<{
    toolName: string;
    message: string;
    timestamp: Date;
  }>;
}

export interface ToolIntrospection {
  definition: ToolDefinition;
  registered: Date;
  executionCount: number;
  averageDuration: number;
  lastError?: {
    message: string;
    timestamp: Date;
  };
}

// ============================================================================
// Standard Categories & Permissions
// ============================================================================

export type ToolCategory = 
  | 'filesystem'
  | 'system'
  | 'browser'
  | 'network'
  | 'data'
  | 'ai'
  | 'session'
  | 'meta';

export type Permission =
  | 'fs.read'
  | 'fs.write'
  | 'fs.delete'
  | 'process.exec'
  | 'process.kill'
  | 'network.http'
  | 'network.ws'
  | 'browser.navigate'
  | 'browser.interact'
  | 'browser.screenshot'
  | 'session.read'
  | 'session.write'
  | 'system.env'
  | 'system.dangerous';

// ============================================================================
// Errors
// ============================================================================

export class ToolExecutorError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ToolExecutorError';
  }
}

export class ToolNotFoundError extends ToolExecutorError {
  constructor(toolName: string) {
    super(`Tool not found: ${toolName}`, 'TOOL_NOT_FOUND', { toolName });
    this.name = 'ToolNotFoundError';
  }
}

export class ToolValidationError extends ToolExecutorError {
  constructor(message: string, public errors: ValidationError[]) {
    super(message, 'VALIDATION_ERROR', { errors });
    this.name = 'ToolValidationError';
  }
}

export class ToolTimeoutError extends ToolExecutorError {
  constructor(toolName: string, timeout: number) {
    super(`Tool execution timed out after ${timeout}ms: ${toolName}`, 'TIMEOUT', { toolName, timeout });
    this.name = 'ToolTimeoutError';
  }
}

export class ToolPermissionError extends ToolExecutorError {
  constructor(toolName: string, public missing: string[]) {
    super(`Missing permissions for tool ${toolName}: ${missing.join(', ')}`, 'PERMISSION_DENIED', { toolName, missing });
    this.name = 'ToolPermissionError';
  }
}

export class ToolAbortedError extends ToolExecutorError {
  constructor(toolName: string) {
    super(`Tool execution was aborted: ${toolName}`, 'ABORTED', { toolName });
    this.name = 'ToolAbortedError';
  }
}
