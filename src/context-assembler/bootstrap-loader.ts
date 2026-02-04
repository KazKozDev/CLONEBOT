/**
 * Bootstrap File Loader
 * 
 * Loads bootstrap files (AGENT.md, SOUL.md, CONTEXT.md) with caching.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { BootstrapFiles } from './types';

// ============================================================================
// Types
// ============================================================================

export interface BootstrapLoaderOptions {
  bootstrapPath: string;
  enableCaching?: boolean;
  cacheTTL?: number; // milliseconds
}

interface CacheEntry {
  content: string;
  loadedAt: number;
}

// ============================================================================
// Bootstrap File Loader
// ============================================================================

export class BootstrapFileLoader {
  private bootstrapPath: string;
  private enableCaching: boolean;
  private cacheTTL: number;
  private cache: Map<string, CacheEntry> = new Map();
  
  constructor(options: BootstrapLoaderOptions) {
    this.bootstrapPath = options.bootstrapPath;
    this.enableCaching = options.enableCaching ?? true;
    this.cacheTTL = options.cacheTTL ?? 60_000; // 60 seconds default
  }
  
  /**
   * Load a single bootstrap file
   */
  async loadFile(filename: string): Promise<string | null> {
    // Check cache first
    if (this.enableCaching) {
      const cached = this.cache.get(filename);
      if (cached) {
        const age = Date.now() - cached.loadedAt;
        if (age < this.cacheTTL) {
          return cached.content;
        } else {
          // Cache expired, remove it
          this.cache.delete(filename);
        }
      }
    }
    
    // Load from disk
    const filePath = path.join(this.bootstrapPath, filename);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Cache the result
      if (this.enableCaching) {
        this.cache.set(filename, {
          content,
          loadedAt: Date.now(),
        });
      }
      
      return content;
    } catch (err) {
      // File not found or read error
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null; // File doesn't exist
      }
      
      throw err; // Other errors should be thrown
    }
  }
  
  /**
   * Load all standard bootstrap files
   */
  async loadAll(): Promise<BootstrapFiles> {
    const [agent, soul, context] = await Promise.all([
      this.loadFile('AGENT.md'),
      this.loadFile('SOUL.md'),
      this.loadFile('CONTEXT.md'),
    ]);
    
    return {
      agent: agent ?? undefined,
      soul: soul ?? undefined,
      context: context ?? undefined,
    };
  }
  
  /**
   * Load specific bootstrap file by name
   */
  async load(name: keyof BootstrapFiles): Promise<string | null> {
    const filenameMap: Record<keyof BootstrapFiles, string> = {
      agent: 'AGENT.md',
      soul: 'SOUL.md',
      context: 'CONTEXT.md',
    };
    
    const filename = filenameMap[name];
    if (!filename) {
      throw new Error(`Unknown bootstrap file: ${name}`);
    }
    
    return this.loadFile(filename);
  }
  
  /**
   * Load agent-specific bootstrap file
   */
  async loadForAgent(agentId: string, name: keyof BootstrapFiles): Promise<string | null> {
    // Try agent-specific file first (e.g., AGENT.research.md)
    const agentFilenameMap: Record<keyof BootstrapFiles, string> = {
      agent: `AGENT.${agentId}.md`,
      soul: `SOUL.${agentId}.md`,
      context: `CONTEXT.${agentId}.md`,
    };
    
    const agentFilename = agentFilenameMap[name];
    const agentContent = await this.loadFile(agentFilename);
    
    if (agentContent !== null) {
      return agentContent;
    }
    
    // Fall back to generic file
    return this.load(name);
  }
  
  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
  
  /**
   * Clear cache for specific file
   */
  clearFileCache(filename: string): void {
    this.cache.delete(filename);
  }
  
  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }
  
  /**
   * Check if file exists
   */
  async exists(name: keyof BootstrapFiles): Promise<boolean> {
    const content = await this.load(name);
    return content !== null;
  }
  
  /**
   * Reload file from disk (bypass cache)
   */
  async reload(name: keyof BootstrapFiles): Promise<string | null> {
    const filenameMap: Record<keyof BootstrapFiles, string> = {
      agent: 'AGENT.md',
      soul: 'SOUL.md',
      context: 'CONTEXT.md',
    };
    
    const filename = filenameMap[name];
    if (!filename) {
      throw new Error(`Unknown bootstrap file: ${name}`);
    }
    
    // Clear cache for this file
    this.clearFileCache(filename);
    
    // Load fresh from disk
    return this.loadFile(filename);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create bootstrap file loader
 */
export function createBootstrapLoader(options: BootstrapLoaderOptions): BootstrapFileLoader {
  return new BootstrapFileLoader(options);
}
