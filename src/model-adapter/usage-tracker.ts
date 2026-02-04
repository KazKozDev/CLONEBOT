/**
 * Usage Tracker
 * Track token usage, costs, and request statistics
 */

import type {
  AdapterStats,
  ProviderStats,
  ModelStats,
  AdapterError,
  TokenUsage,
} from './types';
import { getModelEntry } from './model-registry';

// ============================================================================
// Usage Tracker
// ============================================================================

export class UsageTracker {
  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;

  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCost = 0;

  private providerStats = new Map<string, ProviderStats>();
  private modelStats = new Map<string, ModelStats>();

  private recentErrors: AdapterError[] = [];
  private errorsByType = new Map<string, number>();

  private latencies: number[] = [];
  private maxRecentErrors: number;

  constructor(maxRecentErrors: number = 100) {
    this.maxRecentErrors = maxRecentErrors;
  }

  // ============================================================================
  // Track Request
  // ============================================================================

  /**
   * Track a successful request
   */
  trackSuccess(
    provider: string,
    model: string,
    usage: TokenUsage,
    latencyMs: number
  ): void {
    this.totalRequests++;
    this.successfulRequests++;
    this.totalInputTokens += usage.inputTokens;
    this.totalOutputTokens += usage.outputTokens;

    // Calculate cost
    const cost = this.calculateCost(model, usage);
    this.totalCost += cost;

    // Track latency
    this.latencies.push(latencyMs);
    if (this.latencies.length > 1000) {
      this.latencies.shift();  // Keep only recent 1000
    }

    // Update provider stats
    this.updateProviderStats(provider, usage, cost, latencyMs, false);

    // Update model stats
    this.updateModelStats(model, usage, cost, latencyMs, false);
  }

  /**
   * Track a failed request
   */
  trackFailure(
    provider: string,
    model: string,
    error: AdapterError,
    latencyMs: number
  ): void {
    this.totalRequests++;
    this.failedRequests++;

    // Track error
    this.recentErrors.push(error);
    if (this.recentErrors.length > this.maxRecentErrors) {
      this.recentErrors.shift();
    }

    const errorType = error.code || 'UNKNOWN';
    this.errorsByType.set(errorType, (this.errorsByType.get(errorType) || 0) + 1);

    // Track latency
    this.latencies.push(latencyMs);
    if (this.latencies.length > 1000) {
      this.latencies.shift();
    }

    // Update provider stats
    this.updateProviderStats(provider, { inputTokens: 0, outputTokens: 0 }, 0, latencyMs, true);

    // Update model stats
    this.updateModelStats(model, { inputTokens: 0, outputTokens: 0 }, 0, latencyMs, true);
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private updateProviderStats(
    provider: string,
    usage: TokenUsage,
    cost: number,
    latencyMs: number,
    isError: boolean
  ): void {
    let stats = this.providerStats.get(provider);
    if (!stats) {
      stats = {
        requests: 0,
        tokens: { input: 0, output: 0 },
        cost: 0,
        errors: 0,
        averageLatencyMs: 0,
      };
      this.providerStats.set(provider, stats);
    }

    stats.requests++;
    stats.tokens.input += usage.inputTokens;
    stats.tokens.output += usage.outputTokens;
    stats.cost += cost;

    if (isError) {
      stats.errors++;
    }

    // Update average latency
    stats.averageLatencyMs =
      (stats.averageLatencyMs * (stats.requests - 1) + latencyMs) / stats.requests;
  }

  private updateModelStats(
    model: string,
    usage: TokenUsage,
    cost: number,
    latencyMs: number,
    isError: boolean
  ): void {
    let stats = this.modelStats.get(model);
    if (!stats) {
      stats = {
        requests: 0,
        tokens: { input: 0, output: 0 },
        cost: 0,
        errors: 0,
        averageLatencyMs: 0,
      };
      this.modelStats.set(model, stats);
    }

    stats.requests++;
    stats.tokens.input += usage.inputTokens;
    stats.tokens.output += usage.outputTokens;
    stats.cost += cost;

    if (isError) {
      stats.errors++;
    }

    // Update average latency
    stats.averageLatencyMs =
      (stats.averageLatencyMs * (stats.requests - 1) + latencyMs) / stats.requests;
  }

  private calculateCost(modelId: string, usage: TokenUsage): number {
    const entry = getModelEntry(modelId);
    if (!entry?.pricing) return 0;

    let cost = 0;

    // Input tokens
    cost += (usage.inputTokens / 1000) * entry.pricing.inputPer1kTokens;

    // Output tokens
    cost += (usage.outputTokens / 1000) * entry.pricing.outputPer1kTokens;

    // Cache tokens (Anthropic)
    if (usage.cacheReadTokens && entry.pricing.cacheReadPer1kTokens) {
      cost += (usage.cacheReadTokens / 1000) * entry.pricing.cacheReadPer1kTokens;
    }
    if (usage.cacheWriteTokens && entry.pricing.cacheWritePer1kTokens) {
      cost += (usage.cacheWriteTokens / 1000) * entry.pricing.cacheWritePer1kTokens;
    }

    return cost;
  }

  // ============================================================================
  // Get Statistics
  // ============================================================================

  /**
   * Get comprehensive statistics
   */
  getStats(): AdapterStats {
    const sortedLatencies = [...this.latencies].sort((a, b) => a - b);
    const p50Index = Math.floor(sortedLatencies.length * 0.5);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);

    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalCost: this.totalCost,

      byProvider: Object.fromEntries(this.providerStats),
      byModel: Object.fromEntries(this.modelStats),

      recentErrors: [...this.recentErrors],
      errorsByType: Object.fromEntries(this.errorsByType),

      averageLatencyMs: this.latencies.length > 0
        ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
        : 0,
      p50LatencyMs: sortedLatencies[p50Index] || 0,
      p95LatencyMs: sortedLatencies[p95Index] || 0,
    };
  }

  /**
   * Get stats for specific provider
   */
  getProviderStats(provider: string): ProviderStats | null {
    return this.providerStats.get(provider) || null;
  }

  /**
   * Get stats for specific model
   */
  getModelStats(model: string): ModelStats | null {
    return this.modelStats.get(model) || null;
  }

  /**
   * Reset all statistics
   */
  reset(): void {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.totalCost = 0;

    this.providerStats.clear();
    this.modelStats.clear();
    this.recentErrors = [];
    this.errorsByType.clear();
    this.latencies = [];
  }

  /**
   * Export stats as JSON
   */
  export(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }
}
