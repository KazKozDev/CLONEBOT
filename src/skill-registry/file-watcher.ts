/**
 * File Watcher - Step 10
 * 
 * Watches skill directories for changes and triggers reloads
 */

import { EventEmitter } from 'events';
import { watch, FSWatcher, Stats } from 'fs';
import { stat, readdir } from 'fs/promises';
import { join, dirname, basename } from 'path';
import type { SkillLoader } from './skill-loader.js';
import type { SkillStore } from './skill-store.js';
import type { Skill } from './types.js';

export interface FileWatcherConfig {
  /**
   * Directories to watch for SKILL.md files
   */
  watchDirs: string[];

  /**
   * Whether to watch recursively
   * @default true
   */
  recursive?: boolean;

  /**
   * Debounce delay in milliseconds
   * @default 500
   */
  debounceMs?: number;

  /**
   * Whether to auto-reload on changes
   * @default true
   */
  autoReload?: boolean;

  /**
   * File patterns to ignore
   * @default [/node_modules/, /\.git/, /dist/, /build/]
   */
  ignorePatterns?: RegExp[];
}

export interface WatchEvent {
  type: 'added' | 'modified' | 'removed';
  path: string;
  timestamp: Date;
}

export interface ReloadResult {
  success: boolean;
  skillName?: string;
  error?: string;
}

/**
 * Watches skill directories for changes and triggers hot-reload
 */
export class FileWatcher extends EventEmitter {
  private config: Required<FileWatcherConfig>;
  private watchers: Map<string, FSWatcher> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private watchedFiles: Map<string, Date> = new Map();
  private loader: SkillLoader;
  private store: SkillStore;
  private isWatching = false;

  constructor(
    loader: SkillLoader,
    store: SkillStore,
    config: FileWatcherConfig
  ) {
    super();
    
    this.loader = loader;
    this.store = store;
    this.config = {
      watchDirs: config.watchDirs,
      recursive: config.recursive ?? true,
      debounceMs: config.debounceMs ?? 500,
      autoReload: config.autoReload ?? true,
      ignorePatterns: config.ignorePatterns ?? [
        /node_modules/,
        /\.git/,
        /dist/,
        /build/,
        /coverage/,
        /\.next/,
        /\.vscode/
      ]
    };
  }

  /**
   * Start watching directories
   */
  async start(): Promise<void> {
    if (this.isWatching) {
      throw new Error('FileWatcher is already watching');
    }

    this.emit('watcher.starting', { dirs: this.config.watchDirs });

    for (const dir of this.config.watchDirs) {
      await this.watchDirectory(dir);
    }

    this.isWatching = true;
    this.emit('watcher.started', { dirs: this.config.watchDirs });
  }

  /**
   * Stop watching directories
   */
  stop(): void {
    if (!this.isWatching) {
      return;
    }

    this.emit('watcher.stopping');

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Close all watchers
    for (const [dir, watcher] of this.watchers.entries()) {
      watcher.close();
      this.emit('watcher.closed', { dir });
    }
    this.watchers.clear();
    this.watchedFiles.clear();

    this.isWatching = false;
    this.emit('watcher.stopped');
  }

  /**
   * Check if currently watching
   */
  watching(): boolean {
    return this.isWatching;
  }

  /**
   * Get list of watched files
   */
  getWatchedFiles(): string[] {
    return Array.from(this.watchedFiles.keys());
  }

  /**
   * Watch a directory for changes
   */
  private async watchDirectory(dir: string): Promise<void> {
    try {
      const stats = await stat(dir);
      if (!stats.isDirectory()) {
        throw new Error(`${dir} is not a directory`);
      }

      // Initial scan for existing SKILL.md files
      await this.scanDirectory(dir);

      // Set up file watcher
      const watcher = watch(
        dir,
        { recursive: this.config.recursive },
        (eventType, filename) => {
          if (!filename) return;

          const fullPath = join(dir, filename);
          this.handleFileChange(eventType, fullPath);
        }
      );

      watcher.on('error', (error) => {
        this.emit('watcher.error', { dir, error: error.message });
      });

      this.watchers.set(dir, watcher);
      this.emit('directory.watched', { dir });
    } catch (error) {
      const err = error as Error;
      this.emit('watcher.error', { dir, error: err.message });
      throw error;
    }
  }

  /**
   * Scan directory for existing SKILL.md files
   */
  private async scanDirectory(dir: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        // Skip ignored patterns
        if (this.shouldIgnore(fullPath)) {
          continue;
        }

        if (entry.isFile() && entry.name === 'SKILL.md') {
          const stats = await stat(fullPath);
          this.watchedFiles.set(fullPath, stats.mtime);
        } else if (entry.isDirectory() && this.config.recursive) {
          await this.scanDirectory(fullPath);
        }
      }
    } catch (error) {
      const err = error as Error;
      this.emit('scan.error', { dir, error: err.message });
    }
  }

  /**
   * Handle file change event
   */
  private handleFileChange(eventType: string, filePath: string): void {
    // Only handle SKILL.md files
    if (basename(filePath) !== 'SKILL.md') {
      return;
    }

    // Skip ignored patterns
    if (this.shouldIgnore(filePath)) {
      return;
    }

    // Debounce rapid changes
    this.debouncedReload(filePath, eventType);
  }

  /**
   * Debounced reload to handle rapid file changes
   */
  private debouncedReload(filePath: string, eventType: string): void {
    // Clear existing timer
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(filePath);
      await this.processFileChange(filePath, eventType);
    }, this.config.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Process file change after debounce
   */
  private async processFileChange(filePath: string, eventType: string): Promise<void> {
    try {
      const exists = await this.fileExists(filePath);

      if (!exists) {
        // File removed
        await this.handleFileRemoved(filePath);
      } else {
        const stats = await stat(filePath);
        const lastModified = this.watchedFiles.get(filePath);

        if (!lastModified) {
          // New file added
          await this.handleFileAdded(filePath, stats);
        } else if (stats.mtime > lastModified) {
          // File modified
          await this.handleFileModified(filePath, stats);
        }
      }
    } catch (error) {
      const err = error as Error;
      this.emit('process.error', { filePath, error: err.message });
    }
  }

  /**
   * Handle new file added
   */
  private async handleFileAdded(filePath: string, stats: Stats): Promise<void> {
    this.watchedFiles.set(filePath, stats.mtime);

    const event: WatchEvent = {
      type: 'added',
      path: filePath,
      timestamp: new Date()
    };

    this.emit('file.added', event);

    if (this.config.autoReload) {
      const result = await this.reloadSkill(filePath);
      this.emit('skill.added', { ...event, result });
    }
  }

  /**
   * Handle file modified
   */
  private async handleFileModified(filePath: string, stats: Stats): Promise<void> {
    this.watchedFiles.set(filePath, stats.mtime);

    const event: WatchEvent = {
      type: 'modified',
      path: filePath,
      timestamp: new Date()
    };

    this.emit('file.modified', event);

    if (this.config.autoReload) {
      const result = await this.reloadSkill(filePath);
      this.emit('skill.reloaded', { ...event, result });
    }
  }

  /**
   * Handle file removed
   */
  private async handleFileRemoved(filePath: string): Promise<void> {
    this.watchedFiles.delete(filePath);

    const event: WatchEvent = {
      type: 'removed',
      path: filePath,
      timestamp: new Date()
    };

    this.emit('file.removed', event);

    if (this.config.autoReload) {
      const result = this.removeSkill(filePath);
      this.emit('skill.removed', { ...event, result });
    }
  }

  /**
   * Reload a skill from file
   */
  private async reloadSkill(filePath: string): Promise<ReloadResult> {
    try {
      // Load skill directly from file
      const result = await this.loader.loadSkill(filePath, 'workspace');

      if (!result.success || !result.skill) {
        return {
          success: false,
          error: result.errors?.[0] || 'No skill loaded from file'
        };
      }

      const skill = result.skill;

      // Check if skill already exists (reload) or new (add)
      const allSkills = this.store.getAll();
      const existing = allSkills.find((s: Skill) => s.name === skill.name);
      
      if (existing) {
        // Update existing skill
        this.store.update(skill);
      } else {
        // Add new skill
        this.store.add(skill);
      }

      return {
        success: true,
        skillName: skill.name
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Remove a skill
   */
  private removeSkill(filePath: string): ReloadResult {
    try {
      // Find skill by file path
      const allSkills = this.store.getAll();
      const skill = allSkills.find((s: Skill) => {
        // Try to match by directory name
        const skillDir = dirname(filePath);
        return skillDir.endsWith(s.name);
      });

      if (!skill) {
        return {
          success: false,
          error: 'Skill not found'
        };
      }

      this.store.remove(skill.name);

      return {
        success: true,
        skillName: skill.name
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Check if file should be ignored
   */
  private shouldIgnore(filePath: string): boolean {
    return this.config.ignorePatterns.some(pattern => pattern.test(filePath));
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Manually trigger reload of all watched files
   */
  async reloadAll(): Promise<{ success: number; failed: number; errors: string[] }> {
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (const filePath of this.watchedFiles.keys()) {
      const result = await this.reloadSkill(filePath);
      if (result.success) {
        results.success++;
      } else {
        results.failed++;
        if (result.error) {
          results.errors.push(`${filePath}: ${result.error}`);
        }
      }
    }

    this.emit('reload.all', results);
    return results;
  }
}
