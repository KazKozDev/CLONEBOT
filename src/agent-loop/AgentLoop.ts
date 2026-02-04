/**
 * Agent Loop
 * 
 * Main facade for agent execution orchestration.
 */

import type {
  RunRequest,
  RunOptions,
  RunHandle,
  AgentLoopConfig,
  AgentLoopDependencies,
  HookName,
  HookHandler,
} from './types';
import { AgentRunner } from './runner';

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CONFIG: AgentLoopConfig = {
  concurrency: {
    maxConcurrentRuns: 10,
    maxConcurrentToolCalls: 5,
  },
  limits: {
    maxTurns: 10,
    maxToolRounds: 5,
    maxToolCallsPerRound: 10,
    queueTimeout: 30000,
  },
  execution: {
    streamEvents: true,
    saveToSession: true,
  },
  retry: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    retryableErrors: ['rate_limit', 'timeout', 'network'],
  },
  streaming: {
    bufferSize: 100,
    enableBackpressure: true,
  },
  persistence: {
    autoSave: true,
    saveInterval: 0,
  },
};

// ============================================================================
// Agent Loop
// ============================================================================

export class AgentLoop {
  private config: AgentLoopConfig;
  private runner: AgentRunner;
  
  constructor(
    dependencies: AgentLoopDependencies,
    config: Partial<AgentLoopConfig> = {}
  ) {
    this.config = this.mergeConfig(config);
    this.runner = new AgentRunner(dependencies, {
      maxConcurrentRuns: this.config.concurrency.maxConcurrentRuns,
      maxTurns: this.config.limits.maxTurns,
      maxToolRounds: this.config.limits.maxToolRounds,
      retry: this.config.retry,
    });
  }
  
  /**
   * Execute a run
   */
  async execute(request: RunRequest, options?: Partial<RunOptions>): Promise<RunHandle> {
    return this.runner.execute(request, {
      ...options,
      maxConcurrentRuns: this.config.concurrency.maxConcurrentRuns,
      maxTurns: this.config.limits.maxTurns,
      maxToolRounds: this.config.limits.maxToolRounds,
    });
  }
  
  /**
   * Register lifecycle hook
   */
  on(name: HookName, handler: HookHandler): void {
    this.runner.onHook(name, handler);
  }
  
  /**
   * Update configuration
   */
  configure(config: Partial<AgentLoopConfig>): void {
    this.config = this.mergeConfig(config);
  }
  
  /**
   * Get current configuration
   */
  getConfig(): AgentLoopConfig {
    return { ...this.config };
  }
  
  /**
   * Merge configuration
   */
  private mergeConfig(config: Partial<AgentLoopConfig>): AgentLoopConfig {
    return {
      concurrency: {
        ...DEFAULT_CONFIG.concurrency,
        ...config.concurrency,
      },
      limits: {
        ...DEFAULT_CONFIG.limits,
        ...config.limits,
      },
      execution: {
        ...DEFAULT_CONFIG.execution,
        ...config.execution,
      },
      retry: {
        ...DEFAULT_CONFIG.retry,
        ...config.retry,
      },
      streaming: {
        ...DEFAULT_CONFIG.streaming,
        ...config.streaming,
      },
      persistence: {
        ...DEFAULT_CONFIG.persistence,
        ...config.persistence,
      },
    };
  }
}
