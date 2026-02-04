/**
 * Defaults Resolution
 * 
 * Resolves model parameters from 4 layers:
 * 1. System defaults
 * 2. Agent defaults
 * 3. Session defaults
 * 4. Request overrides
 */

import type { ModelParameters, AssemblyOptions, ContextAssemblerConfig } from './types';

// ============================================================================
// Defaults Resolver
// ============================================================================

export class DefaultsResolver {
  private config: ContextAssemblerConfig;
  
  constructor(config: ContextAssemblerConfig) {
    this.config = config;
  }
  
  /**
   * Resolve parameters from all layers
   */
  resolve(
    agentDefaults: Partial<ModelParameters> = {},
    sessionDefaults: Partial<ModelParameters> = {},
    requestOverrides: AssemblyOptions = {}
  ): ModelParameters {
    // Layer 1: System defaults (from config)
    const systemDefaults: ModelParameters = {
      modelId: this.config.defaultModel,
      temperature: this.config.defaultTemperature,
      maxTokens: this.config.defaultMaxTokens,
    };
    
    // Layer 2: Agent defaults
    const withAgentDefaults = this.mergeParameters(systemDefaults, agentDefaults);
    
    // Layer 3: Session defaults
    const withSessionDefaults = this.mergeParameters(withAgentDefaults, sessionDefaults);
    
    // Layer 4: Request overrides
    const requestParams = this.extractRequestParameters(requestOverrides);
    const final = this.mergeParameters(withSessionDefaults, requestParams);
    
    return final;
  }
  
  /**
   * Extract model parameters from assembly options
   */
  private extractRequestParameters(options: AssemblyOptions): Partial<ModelParameters> {
    return {
      modelId: options.modelId,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      topK: options.topK,
      thinkingLevel: options.thinkingLevel,
      thinkingBudget: options.thinkingBudget,
    };
  }
  
  /**
   * Merge two parameter sets (second overrides first)
   */
  private mergeParameters(
    base: Partial<ModelParameters>,
    overrides: Partial<ModelParameters>
  ): ModelParameters {
    return {
      modelId: overrides.modelId ?? base.modelId ?? this.config.defaultModel,
      temperature: overrides.temperature ?? base.temperature,
      maxTokens: overrides.maxTokens ?? base.maxTokens,
      topP: overrides.topP ?? base.topP,
      topK: overrides.topK ?? base.topK,
      thinkingLevel: overrides.thinkingLevel ?? base.thinkingLevel,
      thinkingBudget: overrides.thinkingBudget ?? base.thinkingBudget,
      stopSequences: overrides.stopSequences ?? base.stopSequences,
    };
  }
  
  /**
   * Get agent defaults from metadata
   */
  getAgentDefaults(agentMetadata: Record<string, unknown>): Partial<ModelParameters> {
    return {
      modelId: this.extractString(agentMetadata, 'defaultModel'),
      temperature: this.extractNumber(agentMetadata, 'defaultTemperature'),
      maxTokens: this.extractNumber(agentMetadata, 'defaultMaxTokens'),
      topP: this.extractNumber(agentMetadata, 'defaultTopP'),
      topK: this.extractNumber(agentMetadata, 'defaultTopK'),
      thinkingLevel: this.extractThinkingLevel(agentMetadata, 'defaultThinkingLevel'),
      thinkingBudget: this.extractNumber(agentMetadata, 'defaultThinkingBudget'),
    };
  }
  
  /**
   * Get session defaults from metadata
   */
  getSessionDefaults(sessionMetadata: Record<string, unknown>): Partial<ModelParameters> {
    return {
      modelId: this.extractString(sessionMetadata, 'modelId'),
      temperature: this.extractNumber(sessionMetadata, 'temperature'),
      maxTokens: this.extractNumber(sessionMetadata, 'maxTokens'),
      topP: this.extractNumber(sessionMetadata, 'topP'),
      topK: this.extractNumber(sessionMetadata, 'topK'),
      thinkingLevel: this.extractThinkingLevel(sessionMetadata, 'thinkingLevel'),
      thinkingBudget: this.extractNumber(sessionMetadata, 'thinkingBudget'),
    };
  }
  
  /**
   * Extract string value from metadata
   */
  private extractString(metadata: Record<string, unknown>, key: string): string | undefined {
    const value = metadata[key];
    return typeof value === 'string' ? value : undefined;
  }
  
  /**
   * Extract number value from metadata
   */
  private extractNumber(metadata: Record<string, unknown>, key: string): number | undefined {
    const value = metadata[key];
    return typeof value === 'number' ? value : undefined;
  }
  
  /**
   * Extract thinking level from metadata
   */
  private extractThinkingLevel(
    metadata: Record<string, unknown>,
    key: string
  ): 'low' | 'medium' | 'high' | undefined {
    const value = metadata[key];
    
    if (value === 'low' || value === 'medium' || value === 'high') {
      return value;
    }
    
    return undefined;
  }
  
  /**
   * Validate parameters
   */
  validate(parameters: ModelParameters): void {
    // Model ID is required
    if (!parameters.modelId) {
      throw new Error('Model ID is required');
    }
    
    // Temperature must be 0-1
    if (parameters.temperature !== undefined) {
      if (parameters.temperature < 0 || parameters.temperature > 1) {
        throw new Error('Temperature must be between 0 and 1');
      }
    }
    
    // Max tokens must be positive
    if (parameters.maxTokens !== undefined) {
      if (parameters.maxTokens <= 0) {
        throw new Error('Max tokens must be positive');
      }
    }
    
    // Top P must be 0-1
    if (parameters.topP !== undefined) {
      if (parameters.topP < 0 || parameters.topP > 1) {
        throw new Error('Top P must be between 0 and 1');
      }
    }
    
    // Top K must be positive
    if (parameters.topK !== undefined) {
      if (parameters.topK <= 0) {
        throw new Error('Top K must be positive');
      }
    }
    
    // Thinking budget must be positive
    if (parameters.thinkingBudget !== undefined) {
      if (parameters.thinkingBudget <= 0) {
        throw new Error('Thinking budget must be positive');
      }
    }
  }
  
  /**
   * Apply constraints based on model limits
   */
  applyConstraints(
    parameters: ModelParameters,
    maxContextWindow: number,
    maxOutput: number
  ): ModelParameters {
    const result = { ...parameters };
    
    // Ensure maxTokens doesn't exceed model's max output
    if (result.maxTokens && result.maxTokens > maxOutput) {
      result.maxTokens = maxOutput;
    }
    
    return result;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create defaults resolver
 */
export function createDefaultsResolver(config: ContextAssemblerConfig): DefaultsResolver {
  return new DefaultsResolver(config);
}
