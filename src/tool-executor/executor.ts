/**
 * Basic Executor
 * 
 * Core execution logic for tools with timeout, cancellation, and hooks.
 */

import type {
  ExecutionContext,
  ToolResult,
  ToolCall,
  ToolExecutorConfig
} from './types';
import {
  ToolNotFoundError,
  ToolTimeoutError,
  ToolAbortedError,
  ToolPermissionError,
  ToolValidationError
} from './types';
import { ToolRegistry } from './registry';
import { HookManager } from './hooks/hook-manager';
import { validateParameters } from './validation/schema-validator';
import { checkPermissions } from './permissions';
import { isContextAborted, normalizeResult, createErrorResult } from './context';

/**
 * Execute a single tool
 */
export async function executeTool(
  registry: ToolRegistry,
  hooks: HookManager,
  name: string,
  params: Record<string, unknown>,
  context: ExecutionContext,
  config: ToolExecutorConfig
): Promise<ToolResult> {
  const startTime = Date.now();

  try {
    // Check if aborted before starting
    if (isContextAborted(context)) {
      throw new ToolAbortedError(name);
    }

    // Get tool
    const tool = registry.get(name);
    if (!tool) {
      throw new ToolNotFoundError(name);
    }

    // Execute before hooks
    const beforeResult = await hooks.executeBeforeHooks({
      toolName: name,
      params,
      executionContext: context
    });

    if (beforeResult.proceed === false) {
      const result = beforeResult.error || createErrorResult(
        'HOOK_BLOCKED',
        beforeResult.reason
      );

      // Record execution
      const duration = Date.now() - startTime;
      registry.recordExecution(name, duration, false, beforeResult.reason);

      return result;
    }

    // Use potentially modified params
    const finalParams = beforeResult.params || params;

    // Debug: log params being validated
    if (process.env.DEBUG === 'true') {
      console.log(`[ToolExecutor] Validating ${name} with params:`, JSON.stringify(finalParams));
    }

    // Validate parameters
    const validation = validateParameters(finalParams, tool.definition.parameters);
    if (!validation.valid) {
      console.error(`[ToolExecutor] Validation failed for ${name}:`, JSON.stringify(validation.errors));
      console.error(`[ToolExecutor] Params were:`, JSON.stringify(finalParams));
      throw new ToolValidationError(
        `Invalid parameters for tool "${name}"`,
        validation.errors || []
      );
    }

    // Check permissions
    const requiredPerms = tool.definition.metadata?.permissions || [];
    const permCheck = checkPermissions(requiredPerms, context.permissions);
    if (!permCheck.allowed) {
      throw new ToolPermissionError(name, permCheck.missing);
    }

    // Use coerced parameters
    const validatedParams = validation.coerced || finalParams;

    // Determine timeout
    const toolTimeout = tool.definition.metadata?.timeout || config.defaultTimeout;
    const effectiveTimeout = Math.min(toolTimeout, context.timeout, config.maxTimeout);

    // Execute with timeout
    const result = await executeWithTimeout(
      tool.handler,
      validatedParams,
      context,
      effectiveTimeout,
      name
    );

    // Normalize result
    const normalizedResult = normalizeResult(result);

    // Add duration metadata
    const duration = Date.now() - startTime;
    const resultWithMeta = {
      ...normalizedResult,
      metadata: {
        ...normalizedResult.metadata,
        duration
      }
    };

    // Execute after hooks
    const finalResult = await hooks.executeAfterHooks({
      toolName: name,
      params: validatedParams,
      result: resultWithMeta,
      executionContext: context,
      duration
    });

    // Record execution
    registry.recordExecution(name, duration, finalResult.success, finalResult.error?.message);

    return finalResult;

  } catch (error) {
    const duration = Date.now() - startTime;

    // Try error hooks
    const hookResult = await hooks.executeErrorHooks({
      toolName: name,
      params,
      error: error as Error,
      executionContext: context
    });

    if (hookResult) {
      // Hook provided fallback
      registry.recordExecution(name, duration, hookResult.success, hookResult.error?.message);
      return hookResult;
    }

    // Convert error to ToolResult
    let result: ToolResult;

    if (error instanceof ToolTimeoutError ||
      error instanceof ToolAbortedError ||
      error instanceof ToolPermissionError ||
      error instanceof ToolNotFoundError ||
      error instanceof ToolValidationError) {
      result = createErrorResult(
        error.code,
        error.message,
        (error as any).details
      );
    } else if (error instanceof Error) {
      result = createErrorResult(
        'EXECUTION_ERROR',
        error.message,
        { stack: error.stack }
      );
    } else {
      result = createErrorResult(
        'UNKNOWN_ERROR',
        String(error)
      );
    }

    // Record execution
    registry.recordExecution(name, duration, false, result.error?.message);

    return result;
  }
}

/**
 * Execute tool handler with timeout
 */
async function executeWithTimeout(
  handler: Function,
  params: Record<string, unknown>,
  context: ExecutionContext,
  timeout: number,
  toolName: string
): Promise<ToolResult> {
  return new Promise<ToolResult>((resolve, reject) => {
    let timeoutId: NodeJS.Timeout | null = null;
    let settled = false;

    // Setup timeout
    timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new ToolTimeoutError(toolName, timeout));
      }
    }, timeout);

    // Setup abort listener
    const abortListener = () => {
      if (!settled) {
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        reject(new ToolAbortedError(toolName));
      }
    };

    context.signal.addEventListener('abort', abortListener);

    // Execute handler
    Promise.resolve(handler(params, context))
      .then(result => {
        if (!settled) {
          settled = true;
          if (timeoutId) clearTimeout(timeoutId);
          context.signal.removeEventListener('abort', abortListener);
          resolve(result);
        }
      })
      .catch(error => {
        if (!settled) {
          settled = true;
          if (timeoutId) clearTimeout(timeoutId);
          context.signal.removeEventListener('abort', abortListener);
          reject(error);
        }
      });
  });
}

/**
 * Execute multiple tools concurrently
 */
export async function executeMany(
  registry: ToolRegistry,
  hooks: HookManager,
  calls: ToolCall[],
  context: ExecutionContext,
  config: ToolExecutorConfig
): Promise<Map<string, ToolResult>> {
  const results = new Map<string, ToolResult>();

  // Execute calls in batches
  const maxConcurrent = config.maxConcurrent;
  const batches: ToolCall[][] = [];

  for (let i = 0; i < calls.length; i += maxConcurrent) {
    batches.push(calls.slice(i, i + maxConcurrent));
  }

  for (const batch of batches) {
    const promises = batch.map(async call => {
      try {
        const result = await executeTool(
          registry,
          hooks,
          call.name,
          call.params,
          context,
          config
        );
        results.set(call.id, result);
      } catch (error) {
        // Shouldn't happen as executeTool catches all errors
        results.set(call.id, createErrorResult(
          'UNEXPECTED_ERROR',
          error instanceof Error ? error.message : String(error)
        ));
      }
    });

    await Promise.all(promises);
  }

  return results;
}
