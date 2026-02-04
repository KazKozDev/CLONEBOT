/**
 * Retry Middleware
 * Automatic retry with exponential backoff for retryable errors
 */

import type { ProviderAdapter, ProviderRequest, Delta, RetryConfig } from '../types';

// ============================================================================
// Default Retry Configuration
// ============================================================================

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60_000,
  backoffMultiplier: 2,
  jitter: true,
  retryableStatuses: [429, 500, 502, 503, 504],
  retryableErrors: [
    'NETWORK_ERROR',
    'TIMEOUT',
    'RATE_LIMIT',
    'INTERNAL_ERROR',
    'SERVICE_UNAVAILABLE',
  ],
};

// ============================================================================
// Retry Wrapper
// ============================================================================

export class RetryAdapter implements ProviderAdapter {
  name: string;
  displayName: string;
  type: 'cloud' | 'local';

  constructor(
    private inner: ProviderAdapter,
    private config: RetryConfig = DEFAULT_RETRY_CONFIG
  ) {
    this.name = inner.name;
    this.displayName = inner.displayName;
    this.type = inner.type;
  }

  // ============================================================================
  // Delegate Methods
  // ============================================================================

  configure(config: any): void {
    this.inner.configure(config);
  }

  async validateCredentials(): Promise<boolean> {
    return this.inner.validateCredentials();
  }

  listModels(): any[] {
    return this.inner.listModels();
  }

  getCapabilities(model: string): any {
    return this.inner.getCapabilities(model);
  }

  supportsModel(model: string): boolean {
    return this.inner.supportsModel(model);
  }

  async healthCheck(): Promise<boolean> {
    return this.inner.healthCheck();
  }

  async dispose(): Promise<void> {
    return this.inner.dispose();
  }

  // ============================================================================
  // Main Complete Method with Retry Logic
  // ============================================================================

  async *complete(request: ProviderRequest): AsyncIterable<Delta> {
    let attempt = 0;
    let lastError: Delta | null = null;

    while (attempt <= this.config.maxRetries) {
      try {
        let hadError = false;

        // Try to consume the stream
        for await (const delta of this.inner.complete(request)) {
          if (delta.type === 'error') {
            hadError = true;
            lastError = delta;

            // Check if error is retryable
            if (this.isRetryable(delta.error)) {
              // Don't yield error yet, will retry
              break;
            } else {
              // Non-retryable error, yield immediately
              yield delta;
              return;
            }
          } else {
            yield delta;
          }
        }

        // If no error occurred, we're done
        if (!hadError) {
          return;
        }

        // Error occurred and is retryable
        attempt++;

        if (attempt > this.config.maxRetries) {
          // Out of retries, yield the last error
          if (lastError) {
            yield lastError;
          }
          return;
        }

        // Wait before retrying
        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);

      } catch (error: any) {
        // Unexpected error in retry logic itself
        yield {
          type: 'error',
          error: {
            code: 'RETRY_ERROR',
            message: `Retry logic failed: ${error.message}`,
            provider: this.name,
            retryable: false,
          },
        };
        return;
      }
    }

    // Exhausted retries, yield final error
    if (lastError) {
      yield lastError;
    }
  }

  // ============================================================================
  // Retry Logic
  // ============================================================================

  private isRetryable(error: any): boolean {
    // Check status code
    if (error.statusCode && this.config.retryableStatuses.includes(error.statusCode)) {
      return true;
    }

    // Check error code
    if (error.code && this.config.retryableErrors.includes(error.code)) {
      return true;
    }

    // Check provider's retryable flag
    if (error.retryable === true) {
      return true;
    }

    return false;
  }

  private calculateDelay(attempt: number): number {
    // Exponential backoff: initialDelay * (multiplier ^ (attempt - 1))
    let delay = this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1);

    // Cap at maxDelay
    delay = Math.min(delay, this.config.maxDelayMs);

    // Add jitter to prevent thundering herd
    if (this.config.jitter) {
      const jitterAmount = delay * 0.2;  // 20% jitter
      delay = delay - jitterAmount + Math.random() * jitterAmount * 2;
    }

    return Math.floor(delay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Wrap adapter with retry middleware
 */
export function withRetry(
  adapter: ProviderAdapter,
  config?: Partial<RetryConfig>
): ProviderAdapter {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  return new RetryAdapter(adapter, fullConfig);
}
