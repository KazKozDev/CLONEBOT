/**
 * Retry Handler
 * 
 * Implements retry logic with exponential backoff.
 */

// ============================================================================
// Retry Configuration
// ============================================================================

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number; // ms
  maxDelay: number; // ms
  backoffMultiplier: number;
  retryableErrors: string[]; // Error message patterns
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'rate_limit',
    'timeout',
    'network',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
  ],
};

// ============================================================================
// Retry Handler
// ============================================================================

export class RetryHandler {
  private config: RetryConfig;
  private attempts: Map<string, number> = new Map();
  
  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }
  
  /**
   * Check if error is retryable
   */
  isRetryable(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    return this.config.retryableErrors.some(pattern =>
      message.includes(pattern.toLowerCase())
    );
  }
  
  /**
   * Check if can retry
   */
  canRetry(runId: string): boolean {
    const attempts = this.attempts.get(runId) ?? 0;
    return attempts < this.config.maxRetries;
  }
  
  /**
   * Record attempt
   */
  recordAttempt(runId: string): number {
    const attempts = (this.attempts.get(runId) ?? 0) + 1;
    this.attempts.set(runId, attempts);
    return attempts;
  }
  
  /**
   * Calculate delay before retry
   */
  getDelay(runId: string): number {
    const attempts = this.attempts.get(runId) ?? 0;
    const delay = this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attempts);
    return Math.min(delay, this.config.maxDelay);
  }
  
  /**
   * Wait before retry
   */
  async wait(runId: string): Promise<void> {
    const delay = this.getDelay(runId);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  /**
   * Execute with retry
   */
  async execute<T>(
    runId: string,
    fn: () => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    while (true) {
      try {
        // Check cancellation
        if (signal?.aborted) {
          throw new Error('Operation cancelled');
        }
        
        return await fn();
      } catch (error) {
        const err = error as Error;
        
        // Check if retryable
        if (!this.isRetryable(err)) {
          throw err;
        }
        
        // Record attempt
        const attempts = this.recordAttempt(runId);
        
        // Check if can retry
        if (attempts >= this.config.maxRetries) {
          throw new Error(`Max retries (${this.config.maxRetries}) exceeded: ${err.message}`);
        }
        
        // Wait before retry
        await this.wait(runId);
      }
    }
  }
  
  /**
   * Reset attempts
   */
  reset(runId: string): void {
    this.attempts.delete(runId);
  }
  
  /**
   * Get attempt count
   */
  getAttempts(runId: string): number {
    return this.attempts.get(runId) ?? 0;
  }
}
