/**
 * Context Assembler
 * 
 * Main facade for context assembly.
 */

import type {
  AssembledContext,
  AssemblyOptions,
  ContextAssemblerConfig,
  ContextAssemblerDependencies,
  CompactionCheck,
} from './types';

import { Assembler } from './assembler';

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CONFIG: ContextAssemblerConfig = {
  bootstrapPath: './bootstrap',
  defaultModel: 'ollama/gpt-oss:20b',
  defaultTemperature: 0.7,
  defaultMaxTokens: 8192,
  truncationStrategy: 'smart',
  reserveTokensForResponse: 2000,
  compactionThreshold: 0.8,
  compactionMessageThreshold: 100,
  includeDatetime: true,
  datetimeFormat: 'YYYY-MM-DD HH:mm:ss',
  datetimeTimezone: 'UTC',
  sectionSeparator: '\n\n---\n\n',
  enableCaching: true,
  cacheFileTTL: 60_000,
  generateToolsSummary: false,
  includeExamplesInPrompt: false,
};

// ============================================================================
// Context Assembler
// ============================================================================

export class ContextAssembler {
  private assembler: Assembler;
  private config: ContextAssemblerConfig;

  constructor(
    dependencies: ContextAssemblerDependencies,
    config: Partial<ContextAssemblerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.assembler = new Assembler(this.config, dependencies);
  }

  /**
   * Assemble context for session
   */
  async assemble(
    sessionId: string,
    agentId: string = 'default',
    options: AssemblyOptions = {}
  ): Promise<AssembledContext> {
    return this.assembler.assemble(sessionId, agentId, options);
  }

  /**
   * Check if compaction is needed
   */
  async checkCompaction(
    sessionId: string,
    agentId: string = 'default'
  ): Promise<CompactionCheck> {
    const context = await this.assemble(sessionId, agentId);

    return {
      needed: context.metadata.shouldCompact,
      reason: context.metadata.compactionReason as any ?? 'none',
      currentTokens: context.metadata.tokenEstimate.total,
      threshold: this.config.compactionThreshold,
      currentMessages: context.messages.length,
      messageThreshold: this.config.compactionMessageThreshold,
    };
  }

  /**
   * Invalidate cache for session
   */
  invalidateCache(sessionId: string): void {
    this.assembler.invalidateCache(sessionId);
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.assembler.clearCaches();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    assembly: import('./cache').CacheStats;
    bootstrap: { size: number; entries: string[] };
  } {
    return this.assembler.getCacheStats();
  }

  /**
   * Get configuration
   */
  getConfig(): ContextAssemblerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ContextAssemblerConfig>): void {
    this.config = { ...this.config, ...updates };
    // Note: Would need to recreate assembler to apply new config
    // For now, changes only affect future assembler instances
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create context assembler
 */
export function createContextAssembler(
  dependencies: ContextAssemblerDependencies,
  config?: Partial<ContextAssemblerConfig>
): ContextAssembler {
  return new ContextAssembler(dependencies, config);
}
