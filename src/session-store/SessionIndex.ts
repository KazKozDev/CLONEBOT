/**
 * Session Index - manages sessions metadata and mapping
 */

import type { FileSystem } from './FileSystem';
import type { SessionIndex, SessionMetadata } from './types';

/**
 * Configuration for SessionIndex
 */
export interface SessionIndexConfig {
  /** Path to sessions.json */
  indexPath: string;
  /** Auto-save delay in ms (0 = immediate) */
  saveDelayMs?: number;
}

/**
 * SessionIndex class
 * Manages mapping: session keys -> session IDs -> metadata
 */
export class SessionIndexManager {
  private index: SessionIndex = {
    keys: {},
    sessions: {}
  };

  private saveTimer: NodeJS.Timeout | null = null;
  private isDirty = false;

  constructor(
    private fs: FileSystem,
    private config: SessionIndexConfig
  ) {}

  /**
   * Load index from disk
   */
  async load(): Promise<void> {
    try {
      const content = await this.fs.read(this.config.indexPath);
      this.index = JSON.parse(content);
    } catch (error: any) {
      if (error.message.includes('ENOENT')) {
        // File doesn't exist - use empty index
        this.index = { keys: {}, sessions: {} };
      } else {
        throw error;
      }
    }
  }

  /**
   * Save index to disk (debounced)
   */
  async save(): Promise<void> {
    this.isDirty = true;

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    const delay = this.config.saveDelayMs ?? 100;

    if (delay === 0) {
      await this.saveNow();
    } else {
      this.saveTimer = setTimeout(() => {
        this.saveNow();
      }, delay);
    }
  }

  /**
   * Force immediate save
   */
  async saveNow(): Promise<void> {
    if (!this.isDirty) return;

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    const content = JSON.stringify(this.index, null, 2);
    await this.fs.write(this.config.indexPath, content);
    this.isDirty = false;
  }

  /**
   * Get session ID by key
   */
  getSessionId(key: string): string | undefined {
    return this.index.keys[key];
  }

  /**
   * Get session metadata by ID
   */
  getMetadata(sessionId: string): SessionMetadata | undefined {
    return this.index.sessions[sessionId];
  }

  /**
   * Get all sessions metadata
   */
  getAllSessions(): Record<string, SessionMetadata> {
    return this.index.sessions;
  }

  /**
   * Get metadata by key
   */
  getMetadataByKey(key: string): SessionMetadata | undefined {
    const sessionId = this.getSessionId(key);
    if (!sessionId) return undefined;
    return this.getMetadata(sessionId);
  }

  /**
   * Check if session key exists
   */
  hasKey(key: string): boolean {
    return key in this.index.keys;
  }

  /**
   * Check if session ID exists
   */
  hasSession(sessionId: string): boolean {
    return sessionId in this.index.sessions;
  }

  /**
   * Register new session
   */
  async registerSession(
    sessionId: string,
    key: string,
    metadata: SessionMetadata
  ): Promise<void> {
    this.index.keys[key] = sessionId;
    this.index.sessions[sessionId] = metadata;
    await this.save();
  }

  /**
   * Update session metadata
   */
  async updateMetadata(
    sessionId: string,
    updates: Partial<SessionMetadata>
  ): Promise<void> {
    const existing = this.index.sessions[sessionId];
    if (!existing) {
      throw new Error(`Session ${sessionId} not found in index`);
    }

    this.index.sessions[sessionId] = {
      ...existing,
      ...updates
    };

    await this.save();
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    // Remove all keys pointing to this session
    for (const [key, id] of Object.entries(this.index.keys)) {
      if (id === sessionId) {
        delete this.index.keys[key];
      }
    }

    // Remove session metadata
    delete this.index.sessions[sessionId];

    await this.save();
  }

  /**
   * Delete session by key
   */
  async deleteSessionByKey(key: string): Promise<void> {
    const sessionId = this.getSessionId(key);
    if (!sessionId) {
      throw new Error(`Session key '${key}' not found`);
    }
    await this.deleteSession(sessionId);
  }

  /**
   * Add additional key to existing session
   */
  async addKey(key: string, sessionId: string): Promise<void> {
    if (!this.hasSession(sessionId)) {
      throw new Error(`Session ${sessionId} not found`);
    }
    this.index.keys[key] = sessionId;
    await this.save();
  }

  /**
   * Remove key mapping
   */
  async removeKey(key: string): Promise<void> {
    delete this.index.keys[key];
    await this.save();
  }

  /**
   * Get all keys for a session
   */
  getSessionKeys(sessionId: string): string[] {
    const keys: string[] = [];
    for (const [key, id] of Object.entries(this.index.keys)) {
      if (id === sessionId) {
        keys.push(key);
      }
    }
    return keys;
  }

  /**
   * Get all session IDs
   */
  getAllSessionIds(): string[] {
    return Object.keys(this.index.sessions);
  }

  /**
   * Get all keys
   */
  getAllKeys(): string[] {
    return Object.keys(this.index.keys);
  }

  /**
   * Get raw index (for testing)
   */
  getRawIndex(): SessionIndex {
    return this.index;
  }

  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    this.index = { keys: {}, sessions: {} };
    await this.saveNow();
  }
}
