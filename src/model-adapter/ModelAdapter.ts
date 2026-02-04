/**
 * Model Adapter - Main Facade
 * Unified interface for all AI providers
 */

import type {
  CompletionRequest,
  Delta,
  ModelInfo,
  ModelAdapterConfig,
  ProviderAdapter,
  ProviderRequest,
  ProviderInfo,
  HealthCheckResult,
  AdapterStats,
  ResolvedModel,
} from './types';

import { CredentialManager } from './credential-manager';
import { resolveModel, tryResolveModel } from './model-resolution';
import { getAllModelInfo, getModelEntry, listProviders } from './model-registry';
import { UsageTracker } from './usage-tracker';

// Import providers
import { AnthropicAdapter } from './providers/anthropic-adapter';
import { OpenAIAdapter } from './providers/openai-adapter';
import { GoogleAdapter } from './providers/google-adapter';
import { OllamaAdapter } from './providers/ollama-adapter';
import { LlamaCppAdapter } from './providers/llamacpp-adapter';


// Import middleware
import { withRetry, DEFAULT_RETRY_CONFIG } from './middleware/retry';
import { createFallbackChain, type FallbackConfig } from './middleware/fallback';

// ============================================================================
// Main Model Adapter
// ============================================================================

export class ModelAdapter {
  private config: ModelAdapterConfig;
  private credentials: CredentialManager;
  private usageTracker: UsageTracker;

  private providers: Map<string, ProviderAdapter> = new Map();

  constructor(config: ModelAdapterConfig = {}) {
    this.config = {
      retry: { ...DEFAULT_RETRY_CONFIG, ...config.retry },
      connectTimeoutMs: config.connectTimeoutMs || 10_000,
      readTimeoutMs: config.readTimeoutMs || 300_000,
      enableUsageTracking: config.enableUsageTracking ?? true,
      maxRecentErrors: config.maxRecentErrors || 100,
      ...config,
    };

    this.credentials = new CredentialManager();
    this.usageTracker = new UsageTracker(this.config.maxRecentErrors);

    // Initialize providers
    this.initializeProviders();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize with credentials
   */
  async initialize(options?: {
    envPrefix?: string;
    configFile?: string;
    programmatic?: any;
  }): Promise<void> {
    await this.credentials.load(options);
    this.configureProviders();
  }

  private initializeProviders(): void {
    // Create adapters
    this.providers.set('anthropic', new AnthropicAdapter());
    this.providers.set('openai', new OpenAIAdapter());
    this.providers.set('google', new GoogleAdapter());
    this.providers.set('ollama', new OllamaAdapter());
    this.providers.set('llamacpp', new LlamaCppAdapter());

  }

  private configureProviders(): void {
    // Configure each provider with credentials
    for (const [name, adapter] of this.providers) {
      const creds = this.credentials.get(name);
      if (creds) {
        adapter.configure({
          credentials: creds,
          timeout: this.config.readTimeoutMs,
        });
      }
    }
  }

  // ============================================================================
  // Main Completion Method
  // ============================================================================

  /**
   * Generate completion with streaming
   */
  async *complete(request: CompletionRequest): AsyncIterable<Delta> {
    const startTime = Date.now();

    try {
      // Resolve model
      const resolved = resolveModel(request.model);

      // Get provider
      const provider = this.getProvider(resolved.provider);
      if (!provider) {
        yield {
          type: 'error',
          error: {
            code: 'PROVIDER_NOT_FOUND',
            message: `Provider "${resolved.provider}" not found or not configured`,
            provider: resolved.provider,
            retryable: false,
          },
        };
        return;
      }

      // Wrap with retry if enabled
      const adapter = this.config.retry
        ? withRetry(provider, this.config.retry)
        : provider;

      // Convert request to provider format
      const providerRequest = this.convertRequest(request, resolved);

      // Track request
      let usage: any = null;
      let hadError = false;

      // Stream deltas
      for await (const delta of adapter.complete(providerRequest)) {
        yield delta;

        // Capture usage
        if (delta.type === 'done') {
          usage = delta.usage;
        }

        // Capture error
        if (delta.type === 'error') {
          hadError = true;
          if (this.config.enableUsageTracking) {
            this.usageTracker.trackFailure(
              resolved.provider,
              resolved.fullId,
              delta.error,
              Date.now() - startTime
            );
          }
        }
      }

      // Track success
      if (!hadError && usage && this.config.enableUsageTracking) {
        this.usageTracker.trackSuccess(
          resolved.provider,
          resolved.fullId,
          usage,
          Date.now() - startTime
        );
      }
    } catch (error: any) {
      yield {
        type: 'error',
        error: {
          code: 'ADAPTER_ERROR',
          message: error.message,
          provider: 'adapter',
          retryable: false,
        },
      };
    }
  }

  /**
   * Complete with fallback chain
   */
  async *completeWithFallback(
    request: CompletionRequest,
    fallbackConfig: FallbackConfig
  ): AsyncIterable<Delta> {
    const fallback = createFallbackChain(
      (model: string) => {
        const resolved = tryResolveModel(model);
        if (!resolved) return null;
        return this.getProvider(resolved.provider);
      },
      fallbackConfig
    );

    const providerRequest = this.convertRequest(request, resolveModel(request.model));
    yield* fallback.complete(providerRequest);
  }

  /**
   * Stream for AgentLoop (converts Delta format to AgentLoop format)
   */
  async *stream(request: {
    model: string;
    systemPrompt?: string;
    messages: any[];
    tools?: any[];
    signal?: AbortSignal;
  }): AsyncIterable<any> {
    // Convert to CompletionRequest
    const completionRequest: CompletionRequest = {
      model: request.model,
      systemPrompt: request.systemPrompt,
      messages: request.messages,
      tools: request.tools,
      signal: request.signal,
    };

    // Stream deltas and convert to AgentLoop format
    let fullContent = '';
    let hasToolCalls = false;
    const toolCalls = new Map<string, { name: string; input: string }>();
    let stopReason: string = 'stop';

    for await (const delta of this.complete(completionRequest)) {
      if (delta.type === 'text') {
        fullContent += delta.text;
        yield { type: 'content', delta: delta.text };
      } else if (delta.type === 'thinking') {
        yield { type: 'thinking', delta: delta.text };
      } else if (delta.type === 'tool_use_start') {
        hasToolCalls = true;
        toolCalls.set(delta.id, { name: delta.name, input: '' });
      } else if (delta.type === 'tool_use_delta') {
        const call = toolCalls.get(delta.id);
        if (call) {
          call.input += delta.input;
        }
      } else if (delta.type === 'tool_use_end') {
        // Tool call completed
      } else if (delta.type === 'done') {
        stopReason = delta.stopReason;

        // Convert tool calls to AgentLoop format
        const toolCallsArray = hasToolCalls ? Array.from(toolCalls.entries()).map(([id, call]) => {
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(call.input);
          } catch (e) {
            console.error(`Failed to parse tool arguments for ${call.name}:`, call.input);
          }

          return {
            id,
            name: call.name,
            arguments: parsedArgs,
          };
        }) : undefined;

        yield {
          type: 'response',
          id: 'resp-' + Date.now(),
          content: fullContent,
          finishReason: stopReason === 'tool_use' ? 'tool_calls' : 'stop',
          toolCalls: toolCallsArray,
          usage: {
            promptTokens: delta.usage.inputTokens,
            completionTokens: delta.usage.outputTokens,
            totalTokens: delta.usage.inputTokens + delta.usage.outputTokens,
          },
        };
      } else if (delta.type === 'error') {
        const errorMsg = delta.error?.message || 'Unknown error';
        throw new Error(errorMsg);
      }
    }
  }

  // ============================================================================
  // Request Conversion
  // ============================================================================

  private convertRequest(request: CompletionRequest, resolved: ResolvedModel): ProviderRequest {
    return {
      model: resolved.model,
      systemPrompt: request.systemPrompt,
      messages: (request.messages || []) as any,  // Type cast for compatibility
      tools: request.tools as any,  // Type cast for compatibility
      parameters: {
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        topP: request.topP,
        topK: request.topK,
        stopSequences: request.stopSequences,
        // Provider-specific
        thinkingLevel: request.thinkingLevel,
        thinkingBudget: request.thinkingBudget,
        jsonMode: request.jsonMode,
        jsonSchema: request.jsonSchema,
        groundingEnabled: request.groundingEnabled,
      },
      signal: request.signal,
    };
  }

  // ============================================================================
  // Provider Management
  // ============================================================================

  /**
   * Get provider adapter
   */
  getProvider(name: string): ProviderAdapter | null {
    return this.providers.get(name) || null;
  }

  /**
   * List all providers
   */
  listProviders(): ProviderInfo[] {
    return Array.from(this.providers.values()).map(adapter => ({
      name: adapter.name,
      displayName: adapter.displayName,
      type: adapter.type,
      status: this.credentials.has(adapter.name) ? 'available' : 'unconfigured',
      models: adapter.listModels().map(m => m.id),
    }));
  }

  /**
   * Add custom provider
   */
  addProvider(name: string, adapter: ProviderAdapter): void {
    this.providers.set(name, adapter);
  }

  // ============================================================================
  // Model Operations
  // ============================================================================

  /**
   * List all available models
   */
  listModels(options?: { provider?: string; capability?: any }): ModelInfo[] {
    let models = getAllModelInfo();

    if (options?.provider) {
      models = models.filter(m => m.provider === options.provider);
    }

    if (options?.capability) {
      models = models.filter(m => (m.capabilities as any)[`supports${options.capability}`]);
    }

    return models;
  }

  /**
   * Get model info
   */
  getModelInfo(model: string): ModelInfo | null {
    const resolved = tryResolveModel(model);
    if (!resolved) return null;

    const entry = getModelEntry(resolved.fullId);
    if (!entry) return null;

    return {
      id: resolved.fullId,
      provider: entry.provider,
      displayName: entry.displayName,
      aliases: entry.aliases,
      capabilities: entry.capabilities,
      pricing: entry.pricing,
      available: this.credentials.has(entry.provider),
    };
  }

  // ============================================================================
  // Health Checks
  // ============================================================================

  /**
   * Check health of all providers
   */
  async healthCheck(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    for (const [name, adapter] of this.providers) {
      const startTime = Date.now();
      let healthy = false;
      let error: string | undefined;

      try {
        healthy = await adapter.healthCheck();
      } catch (err: any) {
        error = err.message;
      }

      results.push({
        provider: name,
        healthy,
        latencyMs: Date.now() - startTime,
        error,
        checkedAt: new Date(),
      });
    }

    return results;
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get usage statistics
   */
  getStats(): AdapterStats {
    return this.usageTracker.getStats();
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.usageTracker.reset();
  }

  /**
   * Export statistics as JSON
   */
  exportStats(): string {
    return this.usageTracker.export();
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Dispose all providers
   */
  async dispose(): Promise<void> {
    for (const adapter of this.providers.values()) {
      await adapter.dispose();
    }
    this.providers.clear();
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create and initialize ModelAdapter
 */
export async function createModelAdapter(
  config: ModelAdapterConfig = {}
): Promise<ModelAdapter> {
  const adapter = new ModelAdapter(config);
  await adapter.initialize();
  return adapter;
}
