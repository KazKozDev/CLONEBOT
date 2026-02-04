/**
 * Model Resolution
 * Resolve model aliases and short names to full provider/model IDs
 */

import type { ResolvedModel } from './types';
import { findModelByAlias, getModelEntry, listProviders } from './model-registry';

// ============================================================================
// Resolution Functions
// ============================================================================

/**
 * Resolve model identifier to provider/model/fullId
 * 
 * Supports formats:
 * - "opus" -> alias lookup
 * - "anthropic/opus" -> provider + alias
 * - "anthropic/claude-opus-4-5-20251124" -> full ID
 * 
 * @throws Error if model cannot be resolved
 */
export function resolveModel(input: string): ResolvedModel {
  const trimmed = input.trim();

  // Check if it's already a full ID (provider/model-name)
  if (trimmed.includes('/')) {
    const [provider, modelPart] = trimmed.split('/', 2);

    // Try as full ID first
    if (getModelEntry(trimmed)) {
      return {
        provider,
        model: modelPart,
        fullId: trimmed,
      };
    }

    // Try provider + alias
    const fullId = findModelByAlias(modelPart);
    if (fullId) {
      const [resolvedProvider, resolvedModel] = fullId.split('/', 2);
      if (resolvedProvider === provider) {
        return {
          provider,
          model: resolvedModel,
          fullId,
        };
      }
    }

    throw new Error(
      `Model "${modelPart}" not found for provider "${provider}". ` +
      `Use resolveModel("${modelPart}") to see available providers.`
    );
  }

  // Try as alias
  const fullId = findModelByAlias(trimmed);
  if (fullId) {
    const [provider, model] = fullId.split('/', 2);
    return { provider, model, fullId };
  }

  // Not found
  throw new Error(
    `Model "${trimmed}" not found. ` +
    `Try using a full ID like "anthropic/claude-opus-4-5-20251124" or an alias like "opus".`
  );
}

/**
 * Try to resolve model, return null if not found
 */
export function tryResolveModel(input: string): ResolvedModel | null {
  try {
    return resolveModel(input);
  } catch {
    return null;
  }
}

/**
 * Check if model exists
 */
export function modelExists(input: string): boolean {
  return tryResolveModel(input) !== null;
}

/**
 * Extract provider from input string
 * Returns null if no provider prefix found
 */
export function extractProvider(input: string): string | null {
  if (!input.includes('/')) return null;
  
  const [provider] = input.split('/', 2);
  const knownProviders = listProviders();
  
  return knownProviders.includes(provider) ? provider : null;
}

/**
 * Get display name for model
 */
export function getDisplayName(input: string): string {
  const resolved = tryResolveModel(input);
  if (!resolved) return input;

  const entry = getModelEntry(resolved.fullId);
  return entry?.displayName || resolved.fullId;
}

/**
 * Normalize model input to full ID
 * Useful for comparing models
 */
export function normalizeModelId(input: string): string {
  const resolved = resolveModel(input);
  return resolved.fullId;
}

/**
 * Check if two model inputs refer to same model
 */
export function isSameModel(a: string, b: string): boolean {
  try {
    return normalizeModelId(a) === normalizeModelId(b);
  } catch {
    return false;
  }
}

/**
 * Get suggestions for misspelled/unknown model
 */
export function getSuggestions(input: string, maxSuggestions: number = 5): string[] {
  const trimmed = input.toLowerCase();
  const suggestions: Array<{ id: string; score: number }> = [];

  // Import model registry to iterate
  const { MODEL_REGISTRY } = require('./model-registry');

  for (const [id, entry] of Object.entries<any>(MODEL_REGISTRY)) {
    let score = 0;

    // Check display name similarity
    if (entry.displayName?.toLowerCase().includes(trimmed)) {
      score += 10;
    }

    // Check alias similarity
    if (entry.aliases) {
      for (const alias of entry.aliases) {
        if (alias.toLowerCase().includes(trimmed)) {
          score += 15;
        }
        if (alias.toLowerCase() === trimmed) {
          score += 50;  // Exact alias match
        }
      }
    }

    // Check ID similarity
    if (id.toLowerCase().includes(trimmed)) {
      score += 5;
    }

    if (score > 0) {
      suggestions.push({ id, score });
    }
  }

  return suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSuggestions)
    .map(s => s.id);
}

/**
 * Resolve with fallback to default
 */
export function resolveOrDefault(input: string, defaultModel: string): ResolvedModel {
  try {
    return resolveModel(input);
  } catch {
    return resolveModel(defaultModel);
  }
}

/**
 * Parse provider-specific model format
 * Some providers use different naming conventions
 */
export function parseProviderFormat(provider: string, modelName: string): string {
  switch (provider) {
    case 'ollama':
      // Ollama uses "model:tag" format
      // Convert to registry format: ollama/model:tag
      if (!modelName.includes('/')) {
        return `ollama/${modelName}`;
      }
      return modelName;

    case 'llamacpp':
      // llama.cpp is just "local" since it runs one model at a time
      return 'llamacpp/local';

    default:
      // Standard format: provider/model-id
      if (modelName.includes('/')) {
        return modelName;
      }
      return `${provider}/${modelName}`;
  }
}
