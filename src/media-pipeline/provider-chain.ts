/**
 * Provider Chain
 * 
 * Manages chain of providers with fallback logic
 */

import { MediaProvider, ProcessingOptions, ProviderResult, MediaCategory } from './types.js';

// ============================================================================
// Provider Chain
// ============================================================================

export class ProviderChain {
  private providers: MediaProvider[] = [];
  
  constructor(
    private readonly type: MediaCategory,
    providers: MediaProvider[]
  ) {
    this.providers = providers.filter(p => p.type === type);
  }
  
  /**
   * Process with fallback
   */
  async process(buffer: Buffer, options: ProcessingOptions): Promise<ProviderResult> {
    const errors: Array<{ provider: string; error: any }> = [];
    
    for (const provider of this.providers) {
      // Skip if not available
      if (!provider.isAvailable()) {
        continue;
      }
      
      try {
        const result = await provider.process(buffer, options);
        
        if (result.success) {
          return result;
        }
        
        // Provider returned error
        errors.push({
          provider: provider.name,
          error: result.error,
        });
        
        // If not retryable, don't try other providers
        if (result.error && !result.error.retryable) {
          break;
        }
        
      } catch (error) {
        errors.push({
          provider: provider.name,
          error,
        });
      }
    }
    
    // All providers failed
    return this.createAggregatedError(errors);
  }
  
  /**
   * Create aggregated error result
   */
  private createAggregatedError(
    errors: Array<{ provider: string; error: any }>
  ): ProviderResult {
    const errorMessages = errors.map(e => 
      `${e.provider}: ${e.error?.message || e.error?.code || 'Unknown error'}`
    ).join('; ');
    
    return {
      success: false,
      type: this.type,
      content: '',
      data: {},
      metadata: {
        provider: 'chain',
        processingTime: 0,
        cached: false,
        originalSize: 0,
        truncated: false,
      },
      error: {
        code: 'ALL_PROVIDERS_FAILED',
        message: `All providers failed: ${errorMessages}`,
        retryable: false,
      },
    };
  }
  
  /**
   * Get list of providers
   */
  getProviders(): MediaProvider[] {
    return [...this.providers];
  }
  
  /**
   * Add provider to chain
   */
  addProvider(provider: MediaProvider): void {
    if (provider.type === this.type) {
      this.providers.push(provider);
    }
  }
  
  /**
   * Remove provider from chain
   */
  removeProvider(name: string): void {
    this.providers = this.providers.filter(p => p.name !== name);
  }
}
