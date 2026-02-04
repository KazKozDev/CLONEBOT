/**
 * Execution Context
 * 
 * Creates and manages execution context for tool invocations.
 */

import type { ExecutionContext, ContextOptions, ToolResult } from './types';

/**
 * Create an execution context for tool invocation
 */
export function createExecutionContext(
  options: ContextOptions,
  invokeTool?: (name: string, params: unknown) => Promise<ToolResult>
): ExecutionContext {
  // Default values
  const permissions = new Set(options.permissions || []);
  const sandboxMode = options.sandboxMode ?? false;
  const workingDirectory = options.workingDirectory || process.cwd();
  const env = options.env || {};
  const timeout = options.timeout || 30000;
  
  // Create abort controller if signal not provided
  const signal = options.signal || new AbortController().signal;
  
  // Default log function
  const log = options.log || ((level: string, message: string, data?: unknown) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      sessionId: options.sessionId,
      runId: options.runId,
      toolCallId: options.toolCallId,
      data
    };
    
    // In production, this would go to a proper logging system
    if (level === 'error') {
      console.error('[Tool Executor]', JSON.stringify(logEntry));
    } else if (level === 'warn') {
      console.warn('[Tool Executor]', JSON.stringify(logEntry));
    } else {
      // Don't log debug/info by default in production
    }
  });
  
  // Default progress emitter
  const emitProgress = options.emitProgress || ((progress: number, message?: string) => {
    log('debug', 'Progress update', { progress, message });
  });
  
  // Default invokeTool throws if not provided
  const invokeToolFn = invokeTool || (async (name: string) => {
    throw new Error(`Cannot invoke tool "${name}": invokeTool not available in this context`);
  });
  
  return {
    sessionId: options.sessionId,
    userId: options.userId, // Pass through userId
    runId: options.runId,
    toolCallId: options.toolCallId,
    permissions,
    sandboxMode,
    workingDirectory,
    env,
    signal,
    timeout,
    log,
    emitProgress,
    invokeTool: invokeToolFn
  };
}

/**
 * Create a child context for nested tool invocation
 */
export function createChildContext(
  parent: ExecutionContext,
  toolCallId: string,
  remainingTimeout: number
): ExecutionContext {
  return {
    ...parent,
    toolCallId,
    timeout: Math.min(remainingTimeout, parent.timeout)
  };
}

/**
 * Check if context is aborted
 */
export function isContextAborted(context: ExecutionContext): boolean {
  return context.signal.aborted;
}

/**
 * Create an error result
 */
export function createErrorResult(
  code: string,
  message: string,
  details?: unknown
): ToolResult {
  return {
    content: `Error: ${message}`,
    success: false,
    error: {
      code,
      message,
      details
    }
  };
}

/**
 * Create a success result
 */
export function createSuccessResult(
  content: string,
  data?: unknown,
  metadata?: ToolResult['metadata']
): ToolResult {
  return {
    content,
    data,
    success: true,
    metadata
  };
}

/**
 * Wrap handler result to ensure it's a ToolResult
 */
export function normalizeResult(result: unknown): ToolResult {
  // Already a ToolResult
  if (
    result &&
    typeof result === 'object' &&
    'content' in result &&
    'success' in result
  ) {
    return result as ToolResult;
  }
  
  // String result - treat as success
  if (typeof result === 'string') {
    return createSuccessResult(result);
  }
  
  // Object with toString - use that
  if (result && typeof result === 'object') {
    return createSuccessResult(JSON.stringify(result, null, 2), result);
  }
  
  // Primitive value
  return createSuccessResult(String(result), result);
}
