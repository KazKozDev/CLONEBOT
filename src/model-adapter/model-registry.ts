/**
 * Model Registry
 * Centralized database of all supported models with metadata
 */

import type { ModelRegistryEntry, ModelInfo, ModelCapabilities, ModelPricing } from './types';

// ============================================================================
// Model Registry Data
// ============================================================================

export const MODEL_REGISTRY: Record<string, ModelRegistryEntry> = {
  // ===== Anthropic =====
  'anthropic/claude-opus-4-5-20251124': {
    provider: 'anthropic',
    displayName: 'Claude Opus 4.5',
    aliases: ['opus', 'claude-opus'],
    capabilities: {
      contextWindow: 200_000,
      maxOutput: 64_000,
      supportsVision: true,
      supportsTools: true,
      supportsThinking: true,
      supportsJsonMode: false,
      supportsStreaming: true,
      supportsSystemPrompt: true,
    },
    pricing: {
      inputPer1kTokens: 0.015,
      outputPer1kTokens: 0.075,
      cacheReadPer1kTokens: 0.0015,
      cacheWritePer1kTokens: 0.01875,
    },
  },

  'anthropic/claude-sonnet-4-5-20251124': {
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4.5',
    aliases: ['sonnet', 'claude-sonnet'],
    capabilities: {
      contextWindow: 200_000,
      maxOutput: 64_000,
      supportsVision: true,
      supportsTools: true,
      supportsThinking: true,
      supportsJsonMode: false,
      supportsStreaming: true,
      supportsSystemPrompt: true,
    },
    pricing: {
      inputPer1kTokens: 0.003,
      outputPer1kTokens: 0.015,
      cacheReadPer1kTokens: 0.0003,
      cacheWritePer1kTokens: 0.00375,
    },
  },

  'anthropic/claude-haiku-4-5-20251124': {
    provider: 'anthropic',
    displayName: 'Claude Haiku 4.5',
    aliases: ['haiku', 'claude-haiku'],
    capabilities: {
      contextWindow: 200_000,
      maxOutput: 64_000,
      supportsVision: true,
      supportsTools: true,
      supportsThinking: false,
      supportsJsonMode: false,
      supportsStreaming: true,
      supportsSystemPrompt: true,
    },
    pricing: {
      inputPer1kTokens: 0.0008,
      outputPer1kTokens: 0.004,
      cacheReadPer1kTokens: 0.00008,
      cacheWritePer1kTokens: 0.001,
    },
  },

  // ===== OpenAI =====
  'openai/gpt5-instant': {
    provider: 'openai',
    displayName: 'GPT-5 Instant',
    aliases: ['gpt5-instant'],
    capabilities: {
      contextWindow: 256_000,
      maxOutput: 16_000,
      supportsVision: true,
      supportsTools: true,
      supportsThinking: false,
      supportsJsonMode: true,
      supportsStreaming: true,
      supportsSystemPrompt: true,
    },
    pricing: {
      inputPer1kTokens: 0.005,
      outputPer1kTokens: 0.015,
    },
  },

  'openai/gpt5-2': {
    provider: 'openai',
    displayName: 'GPT-5-2',
    aliases: ['gpt5-2'],
    capabilities: {
      contextWindow: 256_000,
      maxOutput: 16_000,
      supportsVision: true,
      supportsTools: true,
      supportsThinking: false,
      supportsJsonMode: true,
      supportsStreaming: true,
      supportsSystemPrompt: true,
    },
    pricing: {
      inputPer1kTokens: 0.01,
      outputPer1kTokens: 0.03,
    },
  },

  'openai/gpt5': {
    provider: 'openai',
    displayName: 'GPT-5',
    aliases: ['gpt5', 'gpt-5'],
    capabilities: {
      contextWindow: 128_000,
      maxOutput: 16_000,
      supportsVision: true,
      supportsTools: true,
      supportsThinking: false,
      supportsJsonMode: true,
      supportsStreaming: true,
      supportsSystemPrompt: true,
    },
    pricing: {
      inputPer1kTokens: 0.0025,
      outputPer1kTokens: 0.01,
    },
  },

  'openai/gpt5-mini': {
    provider: 'openai',
    displayName: 'GPT-5 Mini',
    aliases: ['gpt5-mini', 'mini'],
    capabilities: {
      contextWindow: 128_000,
      maxOutput: 16_000,
      supportsVision: true,
      supportsTools: true,
      supportsThinking: false,
      supportsJsonMode: true,
      supportsStreaming: true,
      supportsSystemPrompt: true,
    },
    pricing: {
      inputPer1kTokens: 0.00015,
      outputPer1kTokens: 0.0006,
    },
  },

  'openai/gpt5-nano': {
    provider: 'openai',
    displayName: 'GPT-5 Nano',
    aliases: ['gpt5-nano', 'nano'],
    capabilities: {
      contextWindow: 64_000,
      maxOutput: 8_000,
      supportsVision: false,
      supportsTools: true,
      supportsThinking: false,
      supportsJsonMode: true,
      supportsStreaming: true,
      supportsSystemPrompt: true,
    },
    pricing: {
      inputPer1kTokens: 0.00005,
      outputPer1kTokens: 0.0002,
    },
  },

  // ===== Google =====
  'google/gemini-3': {
    provider: 'google',
    displayName: 'Gemini 3',
    aliases: ['gemini-3', 'gemini'],
    capabilities: {
      contextWindow: 1_000_000,
      maxOutput: 8_192,
      supportsVision: true,
      supportsTools: true,
      supportsThinking: false,
      supportsJsonMode: true,
      supportsStreaming: true,
      supportsSystemPrompt: true,
    },
    pricing: {
      inputPer1kTokens: 0.002,
      outputPer1kTokens: 0.006,
    },
  },

  'google/gemini-3-flash': {
    provider: 'google',
    displayName: 'Gemini 3 Flash',
    aliases: ['gemini-flash', 'flash'],
    capabilities: {
      contextWindow: 1_000_000,
      maxOutput: 8_192,
      supportsVision: true,
      supportsTools: true,
      supportsThinking: false,
      supportsJsonMode: true,
      supportsStreaming: true,
      supportsSystemPrompt: true,
    },
    pricing: {
      inputPer1kTokens: 0.0001,
      outputPer1kTokens: 0.0003,
    },
  },

  // ===== Ollama (Local) =====
  'ollama/gpt-oss:20b': {
    provider: 'ollama',
    displayName: 'GPT-OSS 20B (Ollama)',
    aliases: ['gpt-oss', 'gpt-oss:20b'],
    capabilities: {
      contextWindow: 128_000,
      maxOutput: 4_096,
      supportsVision: true,
      supportsTools: true,
      supportsThinking: false,
      supportsJsonMode: true,
      supportsStreaming: true,
      supportsSystemPrompt: true,
    },
  },

  'ollama/qwen3-vl:4b': {
    provider: 'ollama',
    displayName: 'Qwen3-VL 4B (Ollama Vision)',
    aliases: ['qwen3-vl', 'qwen3-vl:4b', 'qwen3-vl-4b'],
    capabilities: {
      contextWindow: 128_000,
      maxOutput: 4_096,
      supportsVision: true,
      supportsTools: true,
      supportsThinking: false,
      supportsJsonMode: true,
      supportsStreaming: true,
      supportsSystemPrompt: true,
    },
  },

  // ===== llama.cpp (Local) =====
  'llamacpp/local': {
    provider: 'llamacpp',
    displayName: 'Local Model (llama.cpp)',
    aliases: ['local', 'llamacpp'],
    capabilities: {
      contextWindow: 8_192,  // Default, varies by model
      maxOutput: 2_048,
      supportsVision: false,
      supportsTools: false,
      supportsThinking: false,
      supportsJsonMode: true,  // Via grammar
      supportsStreaming: true,
      supportsSystemPrompt: true,
    },
  },
};

// ============================================================================
// Registry Functions
// ============================================================================

/**
 * Get model entry by full ID
 */
export function getModelEntry(modelId: string): ModelRegistryEntry | null {
  return MODEL_REGISTRY[modelId] || null;
}

/**
 * List all registered models
 */
export function listAllModels(): string[] {
  return Object.keys(MODEL_REGISTRY);
}

/**
 * List models by provider
 */
export function listModelsByProvider(provider: string): string[] {
  return Object.entries(MODEL_REGISTRY)
    .filter(([, entry]) => entry.provider === provider)
    .map(([id]) => id);
}

/**
 * Get all aliases for a model
 */
export function getAliases(modelId: string): string[] {
  const entry = getModelEntry(modelId);
  return entry?.aliases || [];
}

/**
 * Find model by alias
 */
export function findModelByAlias(alias: string): string | null {
  const normalized = alias.toLowerCase().trim();

  for (const [id, entry] of Object.entries(MODEL_REGISTRY)) {
    if (entry.aliases.some(a => a.toLowerCase() === normalized)) {
      return id;
    }
  }

  return null;
}

/**
 * Get all providers
 */
export function listProviders(): string[] {
  const providers = new Set<string>();
  for (const entry of Object.values(MODEL_REGISTRY)) {
    providers.add(entry.provider);
  }
  return Array.from(providers);
}

/**
 * Convert registry entry to ModelInfo
 */
export function toModelInfo(modelId: string, available: boolean = true): ModelInfo | null {
  const entry = getModelEntry(modelId);
  if (!entry) return null;

  return {
    id: modelId,
    provider: entry.provider,
    displayName: entry.displayName,
    aliases: entry.aliases,
    capabilities: entry.capabilities,
    pricing: entry.pricing,
    available,
  };
}

/**
 * Get all models as ModelInfo
 */
export function getAllModelInfo(includeUnavailable: boolean = false): ModelInfo[] {
  return Object.keys(MODEL_REGISTRY)
    .map(id => toModelInfo(id, true))
    .filter((info): info is ModelInfo => info !== null);
}

/**
 * Filter models by capability
 */
export function filterByCapability(
  capability: keyof ModelCapabilities,
  value: boolean = true
): string[] {
  return Object.entries(MODEL_REGISTRY)
    .filter(([, entry]) => entry.capabilities[capability] === value)
    .map(([id]) => id);
}

/**
 * Get cheapest model by provider
 */
export function getCheapestModel(provider: string): string | null {
  const models = listModelsByProvider(provider);
  let cheapest: string | null = null;
  let lowestCost = Infinity;

  for (const modelId of models) {
    const entry = getModelEntry(modelId);
    if (!entry?.pricing) continue;

    const avgCost = (entry.pricing.inputPer1kTokens + entry.pricing.outputPer1kTokens) / 2;
    if (avgCost < lowestCost) {
      lowestCost = avgCost;
      cheapest = modelId;
    }
  }

  return cheapest;
}

/**
 * Get most capable model by provider
 */
export function getMostCapableModel(provider: string): string | null {
  const models = listModelsByProvider(provider);
  let best: string | null = null;
  let maxScore = -1;

  for (const modelId of models) {
    const entry = getModelEntry(modelId);
    if (!entry) continue;

    const score =
      entry.capabilities.contextWindow / 1000 +
      (entry.capabilities.supportsVision ? 10 : 0) +
      (entry.capabilities.supportsTools ? 10 : 0) +
      (entry.capabilities.supportsThinking ? 20 : 0) +
      (entry.capabilities.supportsJsonMode ? 5 : 0);

    if (score > maxScore) {
      maxScore = score;
      best = modelId;
    }
  }

  return best;
}
