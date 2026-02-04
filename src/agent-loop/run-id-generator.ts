/**
 * Run ID Generator
 * 
 * Generates unique, sortable, URL-safe run IDs.
 */

import { customAlphabet } from 'nanoid';

// ============================================================================
// Constants
// ============================================================================

const RUN_ID_PREFIX = 'run_';
const RANDOM_LENGTH = 8;
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

// Create nanoid generator
const nanoid = customAlphabet(ALPHABET, RANDOM_LENGTH);

// ============================================================================
// Run ID Generator
// ============================================================================

export class RunIdGenerator {
  /**
   * Generate a unique run ID
   */
  generateRunId(): string {
    const timestamp = Date.now();
    const random = nanoid();
    return `${RUN_ID_PREFIX}${timestamp}_${random}`;
  }
  
  /**
   * Parse a run ID into components
   */
  parseRunId(runId: string): { timestamp: number; random: string } | null {
    if (!this.isValidRunId(runId)) {
      return null;
    }
    
    const withoutPrefix = runId.slice(RUN_ID_PREFIX.length);
    const parts = withoutPrefix.split('_');
    
    if (parts.length !== 2) {
      return null;
    }
    
    const timestamp = parseInt(parts[0], 10);
    const random = parts[1];
    
    if (isNaN(timestamp)) {
      return null;
    }
    
    return { timestamp, random };
  }
  
  /**
   * Validate a run ID format
   */
  isValidRunId(runId: string): boolean {
    if (typeof runId !== 'string') {
      return false;
    }
    
    if (!runId.startsWith(RUN_ID_PREFIX)) {
      return false;
    }
    
    const withoutPrefix = runId.slice(RUN_ID_PREFIX.length);
    const parts = withoutPrefix.split('_');
    
    if (parts.length !== 2) {
      return false;
    }
    
    // Check timestamp part
    const timestamp = parseInt(parts[0], 10);
    if (isNaN(timestamp) || timestamp <= 0) {
      return false;
    }
    
    // Check random part
    const random = parts[1];
    if (random.length !== RANDOM_LENGTH) {
      return false;
    }
    
    // Check only allowed characters
    for (const char of random) {
      if (!ALPHABET.includes(char)) {
        return false;
      }
    }
    
    return true;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const runIdGenerator = new RunIdGenerator();

// ============================================================================
// Convenience Functions
// ============================================================================

export function generateRunId(): string {
  return runIdGenerator.generateRunId();
}

export function parseRunId(runId: string) {
  return runIdGenerator.parseRunId(runId);
}

export function isValidRunId(runId: string): boolean {
  return runIdGenerator.isValidRunId(runId);
}
