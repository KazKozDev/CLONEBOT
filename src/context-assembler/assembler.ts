/**
 * Assembler
 * 
 * Core assembly logic that orchestrates all components.
 */

import type {
  AssembledContext,
  AssemblyOptions,
  ContextAssemblerConfig,
  ContextAssemblerDependencies,
  TokenBreakdown,
  AssemblyMetadata,
  SessionMessage,
  ModelMessage,
  ToolDefinition,
  ModelParameters,
} from './types';

import { TokenEstimator } from './token-estimator';
import { getModelLimits, getRecommendedMaxContext } from './model-limits';
import { BootstrapFileLoader } from './bootstrap-loader';
import { SystemPromptBuilder } from './system-prompt-builder';
import { MessageTransformer } from './message-transformer';
import { ToolCollector } from './tool-collector';
import { ContextTruncator } from './truncation';
import { DefaultsResolver } from './defaults';
import { CompactionDetector } from './compaction';
import { AssemblyCache } from './cache';
import { SkillsIntegrator } from './skills-integration';

// ============================================================================
// Assembler
// ============================================================================

export class Assembler {
  private config: ContextAssemblerConfig;
  private dependencies: ContextAssemblerDependencies;

  // Components
  private tokenEstimator: TokenEstimator;
  private bootstrapLoader: BootstrapFileLoader;
  private systemPromptBuilder: SystemPromptBuilder;
  private messageTransformer: MessageTransformer;
  private toolCollector: ToolCollector;
  private contextTruncator: ContextTruncator;
  private defaultsResolver: DefaultsResolver;
  private compactionDetector: CompactionDetector;
  private cache: AssemblyCache;
  private skillsIntegrator: SkillsIntegrator;

  constructor(
    config: ContextAssemblerConfig,
    dependencies: ContextAssemblerDependencies
  ) {
    this.config = config;
    this.dependencies = dependencies;

    // Initialize components
    this.tokenEstimator = new TokenEstimator({ mode: 'simple' });
    this.bootstrapLoader = new BootstrapFileLoader({
      bootstrapPath: config.bootstrapPath || './bootstrap',
      enableCaching: config.enableCaching,
      cacheTTL: config.cacheFileTTL,
    });
    this.systemPromptBuilder = new SystemPromptBuilder(config.sectionSeparator);
    this.messageTransformer = new MessageTransformer();
    this.toolCollector = new ToolCollector(dependencies.toolExecutor);
    this.contextTruncator = new ContextTruncator(this.tokenEstimator, this.messageTransformer);
    this.defaultsResolver = new DefaultsResolver(config);
    this.compactionDetector = new CompactionDetector(config);
    this.cache = new AssemblyCache(config.cacheFileTTL);
    this.skillsIntegrator = new SkillsIntegrator(dependencies.skillProvider);
  }

  /**
   * Assemble complete context
   */
  async assemble(
    sessionId: string,
    agentId: string,
    options: AssemblyOptions = {}
  ): Promise<AssembledContext> {
    const startTime = Date.now();

    // Step 1: Get session data (metadata first so caching can track session changes)
    const sessionMetadata = (await this.dependencies.sessionStore.getMetadata(sessionId)) || {};
    const cacheOptions: Record<string, unknown> = {
      ...(options as Record<string, unknown>),
      __sessionUpdatedAt: (sessionMetadata as any).updatedAt ?? null,
      __sessionMessageCount: (sessionMetadata as any).messageCount ?? null,
    };

    // Check cache first
    if (this.config.enableCaching) {
      const cached = this.cache.get(sessionId, cacheOptions);
      if (cached) {
        return cached;
      }
    }

    const sessionMessages = await this.dependencies.sessionStore.getMessages(sessionId);

    // Step 2: Resolve parameters
    const agentDefaults = this.defaultsResolver.getAgentDefaults(sessionMetadata);
    const sessionDefaults = this.defaultsResolver.getSessionDefaults(sessionMetadata);
    
    // Merge with Memory Store config if available
    if (this.dependencies.memoryStore) {
      const memoryConfig = this.dependencies.memoryStore.getConfig();
      if (memoryConfig.defaultModel) {
        sessionDefaults.modelId = sessionDefaults.modelId || memoryConfig.defaultModel;
      }
      if (typeof memoryConfig.temperature === 'number') {
        sessionDefaults.temperature = sessionDefaults.temperature ?? memoryConfig.temperature;
      }
      if (typeof memoryConfig.maxTokens === 'number') {
        sessionDefaults.maxTokens = sessionDefaults.maxTokens ?? memoryConfig.maxTokens;
      }
    }
    
    let parameters = this.defaultsResolver.resolve(agentDefaults, sessionDefaults, options);

    // Step 3: Get model limits
    const modelLimits = getModelLimits(parameters.modelId);
    const maxContextTokens = options.maxContextTokens ??
      getRecommendedMaxContext(parameters.modelId);

    // Apply constraints
    parameters = this.defaultsResolver.applyConstraints(
      parameters,
      modelLimits.contextWindow,
      modelLimits.maxOutput
    );

    // Validate
    this.defaultsResolver.validate(parameters);

    // Step 4: Load bootstrap files
    const bootstrap = await this.bootstrapLoader.loadAll();

    // Step 5: Get active skills
    const skipSkills = options.skipSkills ?? false;
    const skills = skipSkills
      ? []
      : await this.skillsIntegrator.getActiveSkills(agentId, sessionId, options.skillFilter);

    // Step 6: Build system prompt
    const systemPrompt = await this.buildSystemPrompt(
      bootstrap,
      skills,
      agentId,
      options
    );

    // Step 7: Transform messages
    let messages = this.messageTransformer.transformComplete(sessionMessages);

    // Step 8: Collect tools
    const tools = await this.collectTools(skills, options);

    // Step 9: Estimate tokens
    const systemPromptTokens = await this.tokenEstimator.estimateSystemPrompt(systemPrompt);
    const toolsTokens = await this.tokenEstimator.estimateTools(tools);
    const messagesTokens = await this.tokenEstimator.estimateMessages(messages);

    let tokenEstimate: TokenBreakdown = {
      systemPrompt: systemPromptTokens,
      tools: toolsTokens,
      messages: messagesTokens,
      total: systemPromptTokens + toolsTokens + messagesTokens,
    };

    // Step 10: Truncate if needed
    const reserveTokens = options.reserveTokens ?? this.config.reserveTokensForResponse;
    const truncationResult = await this.contextTruncator.truncate(messages, {
      strategy: this.config.truncationStrategy,
      maxTokens: maxContextTokens,
      reserveTokens,
      systemPromptTokens,
      toolsTokens,
    });

    messages = truncationResult.messages;
    const truncated = truncationResult.info.removedCount > 0;

    // Update token estimate after truncation
    tokenEstimate.messages = truncationResult.info.finalTokens;
    tokenEstimate.total = systemPromptTokens + toolsTokens + truncationResult.info.finalTokens;

    // Step 11: Check compaction
    const stats = this.compactionDetector.calculateStats(
      sessionMessages.length,
      tokenEstimate.total,
      this.countToolCalls(sessionMessages),
      sessionMetadata.lastCompactionAt as string | undefined
    );

    const compactionCheck = this.compactionDetector.check(
      stats,
      tokenEstimate.total,
      maxContextTokens
    );

    // Step 12: Build metadata
    const metadata: AssemblyMetadata = {
      sessionId,
      modelId: parameters.modelId,
      tokenEstimate,
      truncated,
      truncationInfo: truncated ? truncationResult.info : undefined,
      shouldCompact: compactionCheck.needed,
      compactionReason: compactionCheck.needed
        ? this.compactionDetector.getReason(compactionCheck)
        : undefined,
      activeSkills: this.skillsIntegrator.getSkillIds(skills),
      assemblyTime: Date.now() - startTime,
    };

    // Step 13: Build result
    const result: AssembledContext = {
      systemPrompt,
      messages,
      tools,
      parameters,
      metadata,
    };

    // Cache result
    if (this.config.enableCaching) {
      this.cache.set(sessionId, cacheOptions, result);
    }

    return result;
  }

  /**
   * Build system prompt from all sources
   */
  private async buildSystemPrompt(
    bootstrap: import('./types').BootstrapFiles,
    skills: import('./types').Skill[],
    agentId: string,
    options: AssemblyOptions
  ): Promise<string> {
    const sections: import('./types').SystemPromptSection[] = [];

    // Memory Store prompts (higher priority)
    if (this.dependencies.memoryStore) {
      const agentPrompt = this.dependencies.memoryStore.getPrompt('agent');
      if (agentPrompt) {
        sections.push({
          name: 'Agent (Memory)',
          content: agentPrompt,
          priority: 100
        });
      }
      
      const soulPrompt = this.dependencies.memoryStore.getPrompt('soul');
      if (soulPrompt) {
        sections.push({
          name: 'Soul (Memory)',
          content: soulPrompt,
          priority: 90
        });
      }
    }

    // Bootstrap sections (fallback)
    if (bootstrap.agent) {
      sections.push({
        name: 'agent',
        content: bootstrap.agent,
        priority: 1000,
      });
    }

    if (bootstrap.soul) {
      sections.push({
        name: 'soul',
        content: bootstrap.soul,
        priority: 900,
      });
    }

    if (bootstrap.context) {
      sections.push({
        name: 'context',
        content: bootstrap.context,
        priority: 800,
      });
    }

    // Skills section
    if (skills.length > 0) {
      const skillsSection = this.systemPromptBuilder.createSkillsSection(skills);
      if (skillsSection) {
        sections.push(skillsSection);
      }
    }

    // Additional system prompt
    if (options.additionalSystemPrompt) {
      sections.push({
        name: 'additional',
        content: options.additionalSystemPrompt,
        priority: 300,
      });
    }

    // Datetime
    if (this.config.includeDatetime) {
      sections.push(
        this.systemPromptBuilder.createDatetimeSection({
          format: this.config.datetimeFormat,
          timezone: this.config.datetimeTimezone,
        })
      );
    }

    // User profile context
    if (this.dependencies.userProfileStore && options.userId) {
      try {
        const userContext = await this.dependencies.userProfileStore.buildUserContext(options.userId);
        if (userContext.trim().length > 0) {
          sections.push({
            name: 'user_profile',
            content: userContext,
            priority: 600,
          });
        }
      } catch (error) {
        // Silent fail - user profile is optional
      }
    }

    return this.systemPromptBuilder.build(sections);
  }

  /**
   * Collect tools from all sources
   */
  private async collectTools(
    skills: import('./types').Skill[],
    options: AssemblyOptions
  ): Promise<ToolDefinition[]> {
    const collectionOptions = {
      sandboxMode: options.sandboxMode,
      permissions: options.permissions,
      exclude: options.disabledTools,
    };

    let tools = await this.toolCollector.collect(skills, collectionOptions);

    // Add additional tools
    if (options.additionalTools && options.additionalTools.length > 0) {
      tools = this.toolCollector.mergeTools(tools, options.additionalTools);
    }

    return tools;
  }

  /**
   * Count tool calls in messages
   */
  private countToolCalls(messages: SessionMessage[]): number {
    return messages.filter(m => m.type === 'tool_call').length;
  }

  /**
   * Invalidate cache for session
   */
  invalidateCache(sessionId: string): void {
    this.cache.invalidate(sessionId);
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.cache.clear();
    this.bootstrapLoader.clearCache();
  }

  /**
   * Get cache stats
   */
  getCacheStats(): {
    assembly: import('./cache').CacheStats;
    bootstrap: { size: number; entries: string[] };
  } {
    return {
      assembly: this.cache.getStats(),
      bootstrap: this.bootstrapLoader.getCacheStats(),
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create assembler
 */
export function createAssembler(
  config: ContextAssemblerConfig,
  dependencies: ContextAssemblerDependencies
): Assembler {
  return new Assembler(config, dependencies);
}
