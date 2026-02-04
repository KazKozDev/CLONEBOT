/**
 * Directory Scanner
 * 
 * Recursively scans directories for SKILL.md files
 * Supports three-tier precedence: workspace > user > bundled
 */

import { readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import type { SkillLocation, ScanResult } from './types';

/**
 * Options for directory scanning
 */
export interface ScanOptions {
  /** Maximum depth for recursive scanning */
  maxDepth?: number;
  /** Patterns to exclude (glob patterns) */
  exclude?: string[];
  /** Follow symbolic links */
  followSymlinks?: boolean;
}

/**
 * Directory Scanner
 * 
 * Recursively finds all SKILL.md files in specified directories
 */
export class DirectoryScanner {
  private readonly defaultExclude = [
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '__tests__',
    '.vscode',
    '.idea'
  ];

  /**
   * Scan a single directory for SKILL.md files
   * 
   * @param directory - Directory to scan
   * @param options - Scan options
   * @returns Scan result with found skill files
   */
  async scan(directory: string, options: ScanOptions = {}): Promise<ScanResult> {
    const maxDepth = options.maxDepth ?? 10;
    const exclude = [...this.defaultExclude, ...(options.exclude || [])];
    const followSymlinks = options.followSymlinks ?? false;

    const result: ScanResult = {
      directory,
      files: [],
      errors: [],
      stats: {
        totalFiles: 0,
        directories: 0,
        skipped: 0,
        errors: 0
      }
    };

    if (!existsSync(directory)) {
      result.errors.push({
        path: directory,
        error: 'Directory does not exist',
        code: 'ENOENT'
      });
      return result;
    }

    await this.scanRecursive(directory, directory, 0, maxDepth, exclude, followSymlinks, result);
    return result;
  }

  /**
   * Scan multiple directories (workspace, user, bundled)
   * 
   * @param locations - Skill locations to scan
   * @param options - Scan options
   * @returns Map of location type to scan results
   */
  async scanAll(
    locations: SkillLocation[],
    options: ScanOptions = {}
  ): Promise<Map<string, ScanResult>> {
    const results = new Map<string, ScanResult>();

    for (const location of locations) {
      if (location.enabled && existsSync(location.path)) {
        const result = await this.scan(location.path, options);
        results.set(location.type, result);
      } else if (location.enabled) {
        // Location is enabled but doesn't exist
        results.set(location.type, {
          directory: location.path,
          files: [],
          errors: [{
            path: location.path,
            error: 'Directory does not exist',
            code: 'ENOENT'
          }],
          stats: {
            totalFiles: 0,
            directories: 0,
            skipped: 0,
            errors: 1
          }
        });
      }
    }

    return results;
  }

  /**
   * Recursive directory scanning
   */
  private async scanRecursive(
    rootPath: string,
    currentPath: string,
    depth: number,
    maxDepth: number,
    exclude: string[],
    followSymlinks: boolean,
    result: ScanResult
  ): Promise<void> {
    if (depth > maxDepth) {
      result.stats.skipped++;
      return;
    }

    try {
      const entries = await readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentPath, entry.name);
        const relativePath = fullPath.replace(rootPath + '/', '');

        // Check if excluded
        if (this.isExcluded(entry.name, exclude)) {
          result.stats.skipped++;
          continue;
        }

        if (entry.isDirectory()) {
          result.stats.directories++;
          await this.scanRecursive(
            rootPath,
            fullPath,
            depth + 1,
            maxDepth,
            exclude,
            followSymlinks,
            result
          );
        } else if (entry.isFile() && entry.name === 'SKILL.md') {
          result.files.push({
            path: fullPath,
            relativePath,
            directory: dirname(fullPath),
            name: entry.name
          });
          result.stats.totalFiles++;
        } else if (entry.isSymbolicLink() && followSymlinks) {
          const linkStat = await stat(fullPath);
          if (linkStat.isDirectory()) {
            result.stats.directories++;
            await this.scanRecursive(
              rootPath,
              fullPath,
              depth + 1,
              maxDepth,
              exclude,
              followSymlinks,
              result
            );
          } else if (linkStat.isFile() && entry.name === 'SKILL.md') {
            result.files.push({
              path: fullPath,
              relativePath,
              directory: dirname(fullPath),
              name: entry.name
            });
            result.stats.totalFiles++;
          }
        }
      }
    } catch (error: any) {
      result.errors.push({
        path: currentPath,
        error: error.message,
        code: error.code
      });
      result.stats.errors++;
    }
  }

  /**
   * Check if name matches exclude patterns
   */
  private isExcluded(name: string, exclude: string[]): boolean {
    return exclude.some(pattern => {
      // Simple glob matching (supports * and exact matches)
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(name);
      }
      return name === pattern;
    });
  }

  /**
   * Get total stats from multiple scan results
   */
  getTotalStats(results: Map<string, ScanResult>): ScanResult['stats'] {
    const total: ScanResult['stats'] = {
      totalFiles: 0,
      directories: 0,
      skipped: 0,
      errors: 0
    };

    const values = Array.from(results.values());
    for (const result of values) {
      total.totalFiles += result.stats.totalFiles;
      total.directories += result.stats.directories;
      total.skipped += result.stats.skipped;
      total.errors += result.stats.errors;
    }

    return total;
  }
}
