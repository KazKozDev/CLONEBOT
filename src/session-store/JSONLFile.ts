/**
 * JSONL (JSON Lines) Reader/Writer
 * Each line is a separate JSON object
 */

import type { FileSystem } from './FileSystem';

/**
 * JSONL utility class
 */
export class JSONLFile<T = any> {
  constructor(
    private fs: FileSystem,
    private filePath: string
  ) {}

  /**
   * Append an object to the file
   */
  async append(obj: T): Promise<void> {
    const line = JSON.stringify(obj) + '\n';
    await this.fs.append(this.filePath, line);
  }

  /**
   * Append multiple objects
   */
  async appendMany(objects: T[]): Promise<void> {
    const lines = objects.map(obj => JSON.stringify(obj) + '\n').join('');
    await this.fs.append(this.filePath, lines);
  }

  /**
   * Read all objects from file
   */
  async readAll(): Promise<T[]> {
    try {
      const content = await this.fs.read(this.filePath);
      return this.parseContent(content);
    } catch (error: any) {
      if (error.message.includes('ENOENT')) {
        return []; // File doesn't exist yet
      }
      throw error;
    }
  }

  /**
   * Read objects with streaming (for large files)
   * Returns async iterator
   */
  async *readStream(): AsyncIterableIterator<T> {
    try {
      const content = await this.fs.read(this.filePath);
      const lines = content.split('\n');

      for (const line of lines) {
        if (line.trim()) {
          try {
            yield JSON.parse(line) as T;
          } catch (error) {
            console.warn(`[JSONL] Skipping invalid JSON line: ${line.slice(0, 100)}`);
          }
        }
      }
    } catch (error: any) {
      if (error.message.includes('ENOENT')) {
        return; // File doesn't exist
      }
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async exists(): Promise<boolean> {
    return await this.fs.exists(this.filePath);
  }

  /**
   * Delete the file
   */
  async delete(): Promise<void> {
    await this.fs.delete(this.filePath);
  }

  /**
   * Get file size
   */
  async size(): Promise<number> {
    try {
      const stats = await this.fs.stat(this.filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * Parse JSONL content into array of objects
   */
  private parseContent(content: string): T[] {
    const results: T[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.trim()) {
        try {
          results.push(JSON.parse(line) as T);
        } catch (error) {
          console.warn(`[JSONL] Skipping invalid JSON line: ${line.slice(0, 100)}`);
        }
      }
    }

    return results;
  }

  /**
   * Write all objects (overwrites file)
   * Use with caution - prefer append for most cases
   */
  async writeAll(objects: T[]): Promise<void> {
    const lines = objects.map(obj => JSON.stringify(obj) + '\n').join('');
    await this.fs.write(this.filePath, lines);
  }
}

/**
 * Helper function to create JSONL file
 */
export function createJSONLFile<T>(fs: FileSystem, filePath: string): JSONLFile<T> {
  return new JSONLFile<T>(fs, filePath);
}
