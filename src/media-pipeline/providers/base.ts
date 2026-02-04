/**
 * Base Provider Class
 * 
 * Abstract base class for media processing providers
 * Provides common functionality:
 * - Credential management
 * - Request retry logic
 * - Rate limiting
 * - Error normalization
 */

import { MediaCategory, ProviderConfig, ProviderResult, ProcessingOptions } from '../types.js';

// ============================================================================
// Retry Configuration
// ============================================================================

interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;        // ms
  maxDelay: number;         // ms
  backoffMultiplier: number;
  retryableErrors: string[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'rate_limit', '429', '503', '504'],
};

// ============================================================================
// Rate Limiter
// ============================================================================

class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second
  
  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }
  
  async acquire(): Promise<void> {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    
    // Wait for token to become available
    const waitTime = (1 - this.tokens) / this.refillRate * 1000;
    await this.sleep(waitTime);
    
    this.refill();
    this.tokens -= 1;
  }
  
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Base Provider Class
// ============================================================================

export abstract class BaseProvider {
  protected config: ProviderConfig = {};
  protected initialized: boolean = false;
  protected rateLimiter?: RateLimiter;
  protected retryConfig: RetryConfig;
  
  constructor(
    public readonly name: string,
    public readonly type: MediaCategory
  ) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG };
  }
  
  // ============================================================================
  // Abstract Methods (must be implemented by subclasses)
  // ============================================================================
  
  abstract get supportedFormats(): string[];
  abstract get maxFileSize(): number;
  abstract get maxDuration(): number | undefined;
  abstract get features(): string[];
  
  /**
   * Actual processing implementation
   */
  protected abstract doProcess(
    buffer: Buffer,
    options: ProcessingOptions
  ): Promise<any>;
  
  /**
   * Format raw result to ProviderResult
   */
  protected abstract formatResult(raw: any, processingTime: number): ProviderResult;
  
  // ============================================================================
  // Lifecycle Methods
  // ============================================================================
  
  /**
   * Initialize provider with configuration
   */
  async initialize(config: ProviderConfig): Promise<void> {
    this.config = config;
    
    // Setup rate limiter if configured
    if (config.rateLimitRPS) {
      this.rateLimiter = new RateLimiter(
        config.rateLimitBurst || config.rateLimitRPS,
        config.rateLimitRPS
      );
    }
    
    // Custom initialization
    await this.onInitialize(config);
    
    this.initialized = true;
  }
  
  /**
   * Override for custom initialization
   */
  protected async onInitialize(config: ProviderConfig): Promise<void> {
    // Override in subclass if needed
  }
  
  /**
   * Check if provider is available (has credentials, etc.)
   */
  isAvailable(): boolean {
    if (!this.initialized) {
      return false;
    }
    
    return this.hasCredentials();
  }
  
  /**
   * Check if provider has required credentials
   */
  protected hasCredentials(): boolean {
    // Override in subclass if API key is required
    return true;
  }
  
  // ============================================================================
  // Processing with Retry Logic
  // ============================================================================
  
  /**
   * Process media with retry logic
   */
  async process(buffer: Buffer, options: ProcessingOptions): Promise<ProviderResult> {
    if (!this.initialized) {
      throw new Error(`Provider ${this.name} not initialized`);
    }
    
    if (!this.isAvailable()) {
      return this.createErrorResult('UNAVAILABLE', 'Provider not available');
    }
    
    // Apply rate limiting
    if (this.rateLimiter) {
      await this.rateLimiter.acquire();
    }
    
    // Process with retry
    return await this.processWithRetry(buffer, options);
  }
  
  /**
   * Process with retry logic
   */
  private async processWithRetry(
    buffer: Buffer,
    options: ProcessingOptions
  ): Promise<ProviderResult> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        const startTime = Date.now();
        const raw = await this.doProcess(buffer, options);
        const processingTime = Date.now() - startTime;
        
        return this.formatResult(raw, processingTime);
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        const isRetryable = this.isRetryableError(lastError);
        const isLastAttempt = attempt === this.retryConfig.maxAttempts;
        
        if (!isRetryable || isLastAttempt) {
          // Don't retry
          break;
        }
        
        // Calculate delay
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
          this.retryConfig.maxDelay
        );
        
        // Wait before retry
        await this.sleep(delay);
      }
    }
    
    // All retries failed
    return this.normalizeError(lastError!);
  }
  
  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    for (const retryable of this.retryConfig.retryableErrors) {
      if (message.includes(retryable.toLowerCase())) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Normalize error to ProviderResult
   */
  private normalizeError(error: Error): ProviderResult {
    const message = error.message;
    
    // Detect error type
    let code = 'UNKNOWN_ERROR';
    let retryable = false;
    
    if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
      code = 'TIMEOUT';
      retryable = true;
    } else if (message.includes('rate limit') || message.includes('429')) {
      code = 'RATE_LIMIT';
      retryable = true;
    } else if (message.includes('unauthorized') || message.includes('401')) {
      code = 'UNAUTHORIZED';
      retryable = false;
    } else if (message.includes('not found') || message.includes('404')) {
      code = 'NOT_FOUND';
      retryable = false;
    } else if (message.includes('invalid') || message.includes('400')) {
      code = 'INVALID_INPUT';
      retryable = false;
    } else if (message.includes('503') || message.includes('504')) {
      code = 'SERVICE_UNAVAILABLE';
      retryable = true;
    }
    
    return this.createErrorResult(code, message, retryable);
  }
  
  /**
   * Create error result
   */
  protected createErrorResult(
    code: string,
    message: string,
    retryable: boolean = false
  ): ProviderResult {
    return {
      success: false,
      type: this.type,
      content: '',
      data: {},
      metadata: {
        provider: this.name,
        processingTime: 0,
        cached: false,
        originalSize: 0,
        truncated: false,
      },
      error: {
        code,
        message,
        retryable,
      },
    };
  }
  
  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // ============================================================================
  // Helper Methods
  // ============================================================================
  
  /**
   * Make HTTP request with timeout
   */
  protected async fetch(
    url: string,
    options: RequestInit & { timeout?: number } = {}
  ): Promise<Response> {
    const timeout = options.timeout || this.config.timeout || 60000;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      return response;
      
    } finally {
      clearTimeout(timeoutId);
    }
  }
  
  /**
   * Check response status
   */
  protected async checkResponse(response: Response): Promise<void> {
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
  }
  
  /**
   * Get API key from config
   */
  protected getApiKey(): string {
    if (!this.config.apiKey) {
      throw new Error(`API key not configured for ${this.name}`);
    }
    return this.config.apiKey;
  }
  
  /**
   * Get endpoint URL
   */
  protected getEndpoint(defaultEndpoint: string): string {
    return this.config.endpoint || defaultEndpoint;
  }
}
