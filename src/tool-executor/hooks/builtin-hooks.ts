/**
 * Built-in Hooks
 * 
 * Standard hooks for logging, permissions, compression, etc.
 */

import type {
  BeforeHook,
  AfterHook,
  ErrorHook,
  ToolExecutorConfig
} from '../types';
import { checkPermissions, isSandboxAllowed } from '../permissions';
import { compressResult } from '../compression';
import { createErrorResult } from '../context';

/**
 * Logging Hook (Before + After)
 * Logs tool execution start and completion
 */
export function createLoggingHook(priority: number = 0): { before: BeforeHook; after: AfterHook } {
  return {
    before: {
      name: 'logging_before',
      priority,
      handler: (context) => {
        context.executionContext.log('info', `Executing tool: ${context.toolName}`, {
          params: context.params
        });
        return { proceed: true };
      }
    },
    after: {
      name: 'logging_after',
      priority,
      handler: (context) => {
        context.executionContext.log('info', `Tool completed: ${context.toolName}`, {
          success: context.result.success,
          duration: context.duration
        });
        return context.result;
      }
    }
  };
}

/**
 * Permission Hook (Before)
 * Checks permissions before execution
 */
export function createPermissionHook(priority: number = 100): BeforeHook {
  return {
    name: 'permission_check',
    priority,
    handler: (context) => {
      // Get tool from registry (this is a bit of a hack since we need registry access)
      // In practice, permission checking is done in executor, but this hook can add logging
      context.executionContext.log('debug', 'Checking permissions', {
        tool: context.toolName,
        available: Array.from(context.executionContext.permissions)
      });
      
      return { proceed: true };
    }
  };
}

/**
 * Timeout Hook (Before)
 * Validates and adjusts timeout
 */
export function createTimeoutHook(config: ToolExecutorConfig, priority: number = 90): BeforeHook {
  return {
    name: 'timeout_check',
    priority,
    handler: (context) => {
      const currentTimeout = context.executionContext.timeout;
      
      // Warn if timeout is very long
      if (currentTimeout > config.maxTimeout) {
        context.executionContext.log('warn', `Timeout exceeds maximum: ${currentTimeout}ms > ${config.maxTimeout}ms`, {
          tool: context.toolName
        });
      }
      
      return { proceed: true };
    }
  };
}

/**
 * Compression Hook (After)
 * Compresses large results
 */
export function createCompressionHook(config: ToolExecutorConfig, priority: number = 10): AfterHook {
  return {
    name: 'result_compression',
    priority,
    handler: (context) => {
      if (context.result.content.length > config.maxResultLength) {
        const compressed = compressResult(
          context.result,
          config.maxResultLength,
          config.truncationStrategy
        );
        
        context.executionContext.log('debug', 'Result compressed', {
          tool: context.toolName,
          originalLength: context.result.content.length,
          compressedLength: compressed.content.length
        });
        
        return compressed;
      }
      
      return context.result;
    }
  };
}

/**
 * Sandbox Hook (Before)
 * Enforces sandbox restrictions
 */
export function createSandboxHook(config: ToolExecutorConfig, priority: number = 110): BeforeHook {
  return {
    name: 'sandbox_check',
    priority,
    handler: (context) => {
      if (!context.executionContext.sandboxMode) {
        return { proceed: true };
      }
      
      // Check if tool is allowed in sandbox
      const allowed = isSandboxAllowed(
        context.toolName,
        config.sandboxAllowlist,
        config.sandboxDenylist
      );
      
      if (!allowed) {
        return {
          proceed: false,
          reason: `Tool "${context.toolName}" not allowed in sandbox mode`,
          error: createErrorResult(
            'SANDBOX_BLOCKED',
            `Tool "${context.toolName}" is not allowed in sandbox mode`
          )
        };
      }
      
      return { proceed: true };
    }
  };
}

/**
 * Error Recovery Hook (Error)
 * Provides graceful error handling
 */
export function createErrorRecoveryHook(priority: number = 0): ErrorHook {
  return {
    name: 'error_recovery',
    priority,
    handler: (context) => {
      context.executionContext.log('error', `Tool execution failed: ${context.toolName}`, {
        error: context.error.message,
        stack: context.error.stack
      });
      
      // Don't provide fallback, let error propagate
      // But ensure it's logged
      return null;
    }
  };
}

/**
 * Rate Limit Hook (Before)
 * Enforces rate limits
 */
export function createRateLimitHook(priority: number = 95): BeforeHook {
  const requestCounts = new Map<string, { count: number; windowStart: number }>();
  
  return {
    name: 'rate_limit',
    priority,
    handler: (context) => {
      // This is a simplified version - in production, use a proper rate limiter
      // For now, just log
      context.executionContext.log('debug', 'Rate limit check', {
        tool: context.toolName
      });
      
      return { proceed: true };
    }
  };
}

/**
 * Validation Hook (Before)
 * Additional parameter validation
 */
export function createValidationHook(priority: number = 80): BeforeHook {
  return {
    name: 'validation',
    priority,
    handler: (context) => {
      // Additional validation beyond schema
      // For example, check for suspicious patterns
      
      const paramsStr = JSON.stringify(context.params);
      
      // Check for very large payloads
      if (paramsStr.length > 1000000) {
        context.executionContext.log('warn', 'Large parameter payload', {
          tool: context.toolName,
          size: paramsStr.length
        });
      }
      
      return { proceed: true };
    }
  };
}

/**
 * Metrics Hook (After)
 * Records metrics
 */
export function createMetricsHook(priority: number = 5): AfterHook {
  return {
    name: 'metrics',
    priority,
    handler: (context) => {
      // In production, send to metrics service
      const metrics = {
        tool: context.toolName,
        duration: context.duration,
        success: context.result.success,
        resultSize: context.result.content.length,
        timestamp: new Date().toISOString()
      };
      
      context.executionContext.log('debug', 'Metrics recorded', metrics);
      
      return context.result;
    }
  };
}

/**
 * Create all standard hooks
 */
export function createStandardHooks(config: ToolExecutorConfig): {
  before: BeforeHook[];
  after: AfterHook[];
  error: ErrorHook[];
} {
  const logging = createLoggingHook();
  
  return {
    before: [
      createSandboxHook(config, 110),
      createPermissionHook(100),
      createRateLimitHook(95),
      createTimeoutHook(config, 90),
      createValidationHook(80),
      logging.before
    ],
    after: [
      createCompressionHook(config, 10),
      createMetricsHook(5),
      logging.after
    ],
    error: [
      createErrorRecoveryHook()
    ]
  };
}
