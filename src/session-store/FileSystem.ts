/**
 * File System Abstraction
 * Allows for easy testing with in-memory implementation
 */

/**
 * File stats
 */
export interface FileStats {
  size: number;
  mtime: Date;
}

/**
 * File system interface
 */
export interface FileSystem {
  /**
   * Read entire file content
   */
  read(path: string): Promise<string>;
  
  /**
   * Write content to file (overwrites)
   */
  write(path: string, content: string): Promise<void>;
  
  /**
   * Append content to file
   */
  append(path: string, content: string): Promise<void>;
  
  /**
   * Check if file exists
   */
  exists(path: string): Promise<boolean>;
  
  /**
   * Delete file
   */
  delete(path: string): Promise<void>;
  
  /**
   * List files in directory
   */
  list(dirPath: string): Promise<string[]>;
  
  /**
   * Create directory (recursive)
   */
  mkdir(dirPath: string): Promise<void>;
  
  /**
   * Get file stats
   */
  stat(path: string): Promise<FileStats>;
}

/**
 * Real file system implementation using Node.js fs
 */
import * as fs from 'fs/promises';
import * as path from 'path';

export class RealFileSystem implements FileSystem {
  async read(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf-8');
  }

  async write(filePath: string, content: string): Promise<void> {
    // Ensure directory exists
    await this.mkdir(path.dirname(filePath));
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async append(filePath: string, content: string): Promise<void> {
    // Ensure directory exists
    await this.mkdir(path.dirname(filePath));
    await fs.appendFile(filePath, content, 'utf-8');
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(filePath: string): Promise<void> {
    await fs.unlink(filePath);
  }

  async list(dirPath: string): Promise<string[]> {
    try {
      return await fs.readdir(dirPath);
    } catch {
      return [];
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  async stat(filePath: string): Promise<{ size: number; mtime: Date }> {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      mtime: stats.mtime,
    };
  }
}

/**
 * In-memory file system for testing
 */
export class InMemoryFileSystem implements FileSystem {
  private files = new Map<string, { content: string; mtime: Date }>();
  private directories = new Set<string>();

  async read(filePath: string): Promise<string> {
    const file = this.files.get(filePath);
    if (!file) {
      throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
    }
    return file.content;
  }

  async write(filePath: string, content: string): Promise<void> {
    await this.mkdir(path.dirname(filePath));
    this.files.set(filePath, { content, mtime: new Date() });
  }

  async append(filePath: string, content: string): Promise<void> {
    await this.mkdir(path.dirname(filePath));
    const existing = this.files.get(filePath);
    const newContent = existing ? existing.content + content : content;
    this.files.set(filePath, { content: newContent, mtime: new Date() });
  }

  async exists(filePath: string): Promise<boolean> {
    return this.files.has(filePath) || this.directories.has(filePath);
  }

  async delete(filePath: string): Promise<void> {
    this.files.delete(filePath);
  }

  async list(dirPath: string): Promise<string[]> {
    const normalized = this.normalizePath(dirPath);
    const results: string[] = [];

    // List files in this directory
    for (const filePath of this.files.keys()) {
      const dir = path.dirname(filePath);
      if (this.normalizePath(dir) === normalized) {
        results.push(path.basename(filePath));
      }
    }

    // List subdirectories
    for (const dir of this.directories) {
      const parent = path.dirname(dir);
      if (this.normalizePath(parent) === normalized && dir !== normalized) {
        const basename = path.basename(dir);
        if (!results.includes(basename)) {
          results.push(basename);
        }
      }
    }

    return results;
  }

  async mkdir(dirPath: string): Promise<void> {
    const normalized = this.normalizePath(dirPath);
    
    // Add all parent directories
    const parts = normalized.split(path.sep).filter(Boolean);
    let current = '';
    
    for (const part of parts) {
      current = current ? path.join(current, part) : part;
      this.directories.add(this.normalizePath(current));
    }
    
    this.directories.add(normalized);
  }

  async stat(filePath: string): Promise<{ size: number; mtime: Date }> {
    const file = this.files.get(filePath);
    if (!file) {
      throw new Error(`ENOENT: no such file or directory, stat '${filePath}'`);
    }
    return {
      size: Buffer.byteLength(file.content, 'utf-8'),
      mtime: file.mtime,
    };
  }

  /**
   * Normalize path for consistent comparison
   */
  private normalizePath(p: string): string {
    return path.normalize(p).replace(/\\/g, '/');
  }

  /**
   * Clear all files (for testing)
   */
  clear(): void {
    this.files.clear();
    this.directories.clear();
  }

  /**
   * Get all files (for debugging)
   */
  getAllFiles(): string[] {
    return Array.from(this.files.keys());
  }
}
