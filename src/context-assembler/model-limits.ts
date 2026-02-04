/**
 * Model Limits Registry
 * 
 * Defines context window sizes and capabilities for supported models.
 */

import type { ModelLimits } from './types';

// ============================================================================
// Model Limits Data
// ============================================================================

export const MODEL_LIMITS: Record<string, ModelLimits> = {
  // Claude 3.7 Sonnet
  'claude-3-7-sonnet': {
    contextWindow: 200_000,
    maxOutput: 8_192,
    recommendedMaxContext: 180_000,
    supportsSystemPrompt: true,
    supportsTools: true,
    supportsVision: true,
    supportsThinking: true,
    tokenizer: 'cl100k_base',
  },

  // Claude 3.5 Sonnet
  'claude-3-5-sonnet': {
    contextWindow: 200_000,
    maxOutput: 8_192,
    recommendedMaxContext: 180_000,
    supportsSystemPrompt: true,
    supportsTools: true,
    supportsVision: true,
    supportsThinking: false,
    tokenizer: 'cl100k_base',
  },

  // Claude 3 Opus
  'claude-3-opus': {
    contextWindow: 200_000,
    maxOutput: 4_096,
    recommendedMaxContext: 180_000,
    supportsSystemPrompt: true,
    supportsTools: true,
    supportsVision: true,
    supportsThinking: false,
    tokenizer: 'cl100k_base',
  },

  // Claude 3 Haiku
  'claude-3-haiku': {
    contextWindow: 200_000,
    maxOutput: 4_096,
    recommendedMaxContext: 180_000,
    supportsSystemPrompt: true,
    supportsTools: true,
    supportsVision: true,
    supportsThinking: false,
    tokenizer: 'cl100k_base',
  },

  // GPT-4o
  'gpt-4o': {
    contextWindow: 128_000,
    maxOutput: 16_384,
    recommendedMaxContext: 110_000,
    supportsSystemPrompt: true,
    supportsTools: true,
    supportsVision: true,
    supportsThinking: false,
    tokenizer: 'cl100k_base',
  },

  // GPT-4o Mini
  'gpt-4o-mini': {
    contextWindow: 128_000,
    maxOutput: 16_384,
    recommendedMaxContext: 110_000,
    supportsSystemPrompt: true,
    supportsTools: true,
    supportsVision: true,
    supportsThinking: false,
    tokenizer: 'cl100k_base',
  },

  // GPT-4 Turbo
  'gpt-4-turbo': {
    contextWindow: 128_000,
    maxOutput: 4_096,
    recommendedMaxContext: 110_000,
    supportsSystemPrompt: true,
    supportsTools: true,
    supportsVision: true,
    supportsThinking: false,
    tokenizer: 'cl100k_base',
  },

  // GPT-4
  'gpt-4': {
    contextWindow: 8_192,
    maxOutput: 4_096,
    recommendedMaxContext: 6_000,
    supportsSystemPrompt: true,
    supportsTools: true,
    supportsVision: false,
    supportsThinking: false,
    tokenizer: 'cl100k_base',
  },

  // GPT-3.5 Turbo
  'gpt-3.5-turbo': {
    contextWindow: 16_385,
    maxOutput: 4_096,
    recommendedMaxContext: 12_000,
    supportsSystemPrompt: true,
    supportsTools: true,
    supportsVision: false,
    supportsThinking: false,
    tokenizer: 'cl100k_base',
  },

  // Gemini 2.0 Flash
  'gemini-2.0-flash': {
    contextWindow: 1_000_000,
    maxOutput: 8_192,
    recommendedMaxContext: 900_000,
    supportsSystemPrompt: true,
    supportsTools: true,
    supportsVision: true,
    supportsThinking: false,
    tokenizer: 'cl100k_base',
  },

  // Gemini 1.5 Pro
  'gemini-1.5-pro': {
    contextWindow: 2_000_000,
    maxOutput: 8_192,
    recommendedMaxContext: 1_800_000,
    supportsSystemPrompt: true,
    supportsTools: true,
    supportsVision: true,
    supportsThinking: false,
    tokenizer: 'cl100k_base',
  },

  // Gemini 1.5 Flash
  'gemini-1.5-flash': {
    contextWindow: 1_000_000,
    maxOutput: 8_192,
    recommendedMaxContext: 900_000,
    supportsSystemPrompt: true,
    supportsTools: true,
    supportsVision: true,
    supportsThinking: false,
    tokenizer: 'cl100k_base',
  },

  // Ollama GPT-OSS
  'ollama/gpt-oss:20b': {
    contextWindow: 128_000,
    maxOutput: 4_096,
    recommendedMaxContext: 32_000,
    supportsSystemPrompt: true,
    supportsTools: true,
    supportsVision: false,
    supportsThinking: false,
    tokenizer: 'cl100k_base',
  },

  // Ollama Qwen3-VL (Vision)
  'ollama/qwen3-vl:4b': {
    contextWindow: 128_000,
    maxOutput: 4_096,
    recommendedMaxContext: 32_000,
    supportsSystemPrompt: true,
    supportsTools: true,
    supportsVision: true,
    supportsThinking: false,
    tokenizer: 'cl100k_base',
  },
};

// ============================================================================
// Default Limits (for unknown models)
// ============================================================================

export const DEFAULT_MODEL_LIMITS: ModelLimits = {
  contextWindow: 8_192,
  maxOutput: 4_096,
  recommendedMaxContext: 6_000,
  supportsSystemPrompt: true,
  supportsTools: false,
  supportsVision: false,
  supportsThinking: false,
  tokenizer: 'cl100k_base',
};

// ============================================================================
// Registry Functions
// ============================================================================

/**
 * Get limits for a specific model
 */
export function getModelLimits(modelId: string): ModelLimits {
  // Try exact match
  if (MODEL_LIMITS[modelId]) {
    return { ...MODEL_LIMITS[modelId] };
  }

  // Try prefix match (e.g., "claude-3-7-sonnet-20250219" → "claude-3-7-sonnet")
  for (const [key, limits] of Object.entries(MODEL_LIMITS)) {
    if (modelId.startsWith(key)) {
      return { ...limits };
    }
  }

  // Fall back to defaults
  console.warn(`Unknown model "${modelId}", using default limits`);
  return { ...DEFAULT_MODEL_LIMITS };
}

/**
 * Check if model supports a specific feature
 */
export function supportsFeature(
  modelId: string,
  feature: 'systemPrompt' | 'tools' | 'vision' | 'thinking'
): boolean {
  const limits = getModelLimits(modelId);

  switch (feature) {
    case 'systemPrompt':
      return limits.supportsSystemPrompt;
    case 'tools':
      return limits.supportsTools;
    case 'vision':
      return limits.supportsVision;
    case 'thinking':
      return limits.supportsThinking;
    default:
      return false;
  }
}

/**
 * Get recommended max context tokens for a model
 */
export function getRecommendedMaxContext(modelId: string): number {
  const limits = getModelLimits(modelId);
  return limits.recommendedMaxContext;
}

/**
 * Get max output tokens for a model
 */
export function getMaxOutput(modelId: string): number {
  const limits = getModelLimits(modelId);
  return limits.maxOutput;
}

/**
 * Get tokenizer name for a model
 */
export function getTokenizer(modelId: string): string {
  const limits = getModelLimits(modelId);
  return limits.tokenizer || 'cl100k_base';
}

/**
 * List all supported models
 */
export function listSupportedModels(): string[] {
  return Object.keys(MODEL_LIMITS);
}

/**
 * Check if a model is known
 */
export function isKnownModel(modelId: string): boolean {
  return MODEL_LIMITS[modelId] !== undefined;
}
