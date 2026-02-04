/**
 * Fallback Chain
 * Try multiple models/providers in sequence until one succeeds
 */

import type { Delta, ProviderRequest } from '../types';
import type { ProviderAdapter } from '../types';

// ============================================================================
// Fallback Configuration
// ============================================================================

export interface FallbackConfig {
  /**
   * List of model IDs to try in order
   * e.g. ["opus", "sonnet", "haiku", "gpt5"]
   */
  models: string[];

  /**
   * Maximum number of fallback attempts
   * Default: try all models
   */
  maxAttempts?: number;

  /**
   * Whether to yield intermediate errors
   * Default: false (only yield final error)
   */
  yieldIntermediateErrors?: boolean;

  /**
   * Custom error handler
   */
  onFallback?: (failedModel: string, error: any, nextModel: string | null) => void;
}

// ============================================================================
// Fallback Adapter
// ============================================================================

export class FallbackAdapter {
  constructor(
    private resolveAdapter: (model: string) => ProviderAdapter | null,
    private config: FallbackConfig
  ) {}

  async *complete(request: ProviderRequest): AsyncIterable<Delta> {
    const maxAttempts = this.config.maxAttempts || this.config.models.length;
    const errors: Array<{ model: string; error: any }> = [];

    for (let i = 0; i < Math.min(maxAttempts, this.config.models.length); i++) {
      const model = this.config.models[i];
      const nextModel = i + 1 < this.config.models.length ? this.config.models[i + 1] : null;

      const adapter = this.resolveAdapter(model);
      if (!adapter) {
        const error = {
          code: 'ADAPTER_NOT_FOUND',
          message: `No adapter found for model: ${model}`,
          provider: 'fallback',
          retryable: false,
        };

        errors.push({ model, error });
        this.config.onFallback?.(model, error, nextModel);

        if (this.config.yieldIntermediateErrors) {
          yield { type: 'error', error };
        }

        continue;
      }

      let hadError = false;
      let lastError: any = null;

      try {
        // Try to consume the stream
        for await (const delta of adapter.complete({ ...request, model })) {
          if (delta.type === 'error') {
            hadError = true;
            lastError = delta.error;

            // Store error for later
            errors.push({ model, error: delta.error });
            this.config.onFallback?.(model, delta.error, nextModel);

            if (this.config.yieldIntermediateErrors) {
              yield delta;
            }

            break;  // Try next model
          } else {
            yield delta;
          }
        }

        // If no error occurred, we're done!
        if (!hadError) {
          return;
        }

      } catch (error: any) {
        // Unexpected error
        const adaptError = {
          code: 'FALLBACK_ERROR',
          message: `Unexpected error with model ${model}: ${error.message}`,
          provider: 'fallback',
          retryable: false,
        };

        errors.push({ model, error: adaptError });
        this.config.onFallback?.(model, adaptError, nextModel);

        if (this.config.yieldIntermediateErrors) {
          yield { type: 'error', error: adaptError };
        }
      }
    }

    // All models failed, yield final error
    yield {
      type: 'error',
      error: {
        code: 'ALL_FALLBACKS_FAILED',
        message: `All ${errors.length} fallback models failed`,
        provider: 'fallback',
        retryable: false,
        details: errors,
      },
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create fallback chain for multiple models
 * 
 * @example
 * ```typescript
 * const fallback = createFallbackChain(
 *   adapter.getProviderForModel.bind(adapter),
 *   {
 *     models: ["opus", "sonnet", "haiku"],
 *     onFallback: (failed, error, next) => {
 *       console.log(`Model ${failed} failed, trying ${next}...`);
 *     }
 *   }
 * );
 * 
 * for await (const delta of fallback.complete(request)) {
 *   // Will try opus, then sonnet, then haiku
 * }
 * ```
 */
export function createFallbackChain(
  resolveAdapter: (model: string) => ProviderAdapter | null,
  config: FallbackConfig
): FallbackAdapter {
  return new FallbackAdapter(resolveAdapter, config);
}

// ============================================================================
// Pre-configured Fallback Chains
// ============================================================================

/**
 * Create fallback chain for Anthropic models (expensive → cheap)
 */
export function createAnthropicFallback(): FallbackConfig {
  return {
    models: ['anthropic/claude-opus-4-5-20251124', 'anthropic/claude-sonnet-4-5-20251124', 'anthropic/claude-haiku-4-5-20251124'],
  };
}

/**
 * Create fallback chain for OpenAI models (expensive → cheap)
 */
export function createOpenAIFallback(): FallbackConfig {
  return {
    models: ['openai/gpt5-instant', 'openai/gpt5', 'openai/gpt5-mini'],
  };
}

/**
 * Create fallback chain: Cloud → Local
 */
export function createCloudToLocalFallback(): FallbackConfig {
  return {
    models: [
      'anthropic/claude-sonnet-4-5-20251124',
      'openai/gpt5',
      'ollama/llama3.3:70b',
      'llamacpp/local',
    ],
  };
}

/**
 * Create fallback chain: Best quality → Fastest
 */
export function createQualityToSpeedFallback(): FallbackConfig {
  return {
    models: [
      'anthropic/claude-opus-4-5-20251124',    // Best quality
      'google/gemini-3',                        // High quality
      'openai/gpt5',                            // Good quality
      'google/gemini-3-flash',                  // Fast
      'openai/gpt5-mini',                       // Very fast
      'anthropic/claude-haiku-4-5-20251124',   // Ultra fast
    ],
  };
}
