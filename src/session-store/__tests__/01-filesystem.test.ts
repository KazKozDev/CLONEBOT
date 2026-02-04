/**
 * Tests for FileSystem abstraction
 */

import { RealFileSystem, InMemoryFileSystem } from '../FileSystem';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('InMemoryFileSystem', () => {
  let fileSystem: InMemoryFileSystem;

  beforeEach(() => {
    fileSystem = new InMemoryFileSystem();
  });

  describe('write and read', () => {
    it('should write and read file', async () => {
      await fileSystem.write('/test.txt', 'hello world');
      const content = await fileSystem.read('/test.txt');
      expect(content).toBe('hello world');
    });

    it('should overwrite existing file', async () => {
      await fileSystem.write('/test.txt', 'first');
      await fileSystem.write('/test.txt', 'second');
      const content = await fileSystem.read('/test.txt');
      expect(content).toBe('second');
    });

    it('should throw on reading non-existent file', async () => {
      await expect(fileSystem.read('/missing.txt'))
        .rejects.toThrow('ENOENT');
    });
  });

  describe('append', () => {
    it('should append to existing file', async () => {
      await fileSystem.write('/test.txt', 'hello');
      await fileSystem.append('/test.txt', ' world');
      const content = await fileSystem.read('/test.txt');
      expect(content).toBe('hello world');
    });

    it('should create file if not exists', async () => {
      await fileSystem.append('/test.txt', 'hello');
      const content = await fileSystem.read('/test.txt');
      expect(content).toBe('hello');
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      await fileSystem.write('/test.txt', 'data');
      expect(await fileSystem.exists('/test.txt')).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      expect(await fileSystem.exists('/missing.txt')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete existing file', async () => {
      await fileSystem.write('/test.txt', 'data');
      await fileSystem.delete('/test.txt');
      expect(await fileSystem.exists('/test.txt')).toBe(false);
    });

    it('should not throw on deleting non-existent file', async () => {
      await expect(fileSystem.delete('/missing.txt')).resolves.not.toThrow();
    });
  });

  describe('list', () => {
    it('should list files in directory', async () => {
      await fileSystem.write('/dir/file1.txt', 'data1');
      await fileSystem.write('/dir/file2.txt', 'data2');
      await fileSystem.write('/other.txt', 'data3');

      const files = await fileSystem.list('/dir');
      expect(files).toEqual(['file1.txt', 'file2.txt']);
    });

    it('should return empty array for empty directory', async () => {
      const files = await fileSystem.list('/empty');
      expect(files).toEqual([]);
    });
  });

  describe('mkdir', () => {
    it('should create directory', async () => {
      await fileSystem.mkdir('/dir/subdir');
      // Directory creation is implicit in InMemoryFileSystem
      await fileSystem.write('/dir/subdir/file.txt', 'data');
      expect(await fileSystem.exists('/dir/subdir/file.txt')).toBe(true);
    });
  });

  describe('stat', () => {
    it('should return file stats', async () => {
      await fileSystem.write('/test.txt', 'hello');
      const stats = await fileSystem.stat('/test.txt');
      expect(stats.size).toBe(5);
      expect(stats.mtime).toBeInstanceOf(Date);
    });

    it('should throw on non-existent file', async () => {
      await expect(fileSystem.stat('/missing.txt'))
        .rejects.toThrow('ENOENT');
    });
  });

  describe('clear', () => {
    it('should clear all files', async () => {
      await fileSystem.write('/file1.txt', 'data1');
      await fileSystem.write('/file2.txt', 'data2');
      fileSystem.clear();
      expect(await fileSystem.exists('/file1.txt')).toBe(false);
      expect(await fileSystem.exists('/file2.txt')).toBe(false);
    });
  });
});

describe('RealFileSystem', () => {
  let fileSystem: RealFileSystem;
  let tempDir: string;

  beforeEach(async () => {
    fileSystem = new RealFileSystem();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-store-test-'));
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('write and read', () => {
    it('should write and read file', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fileSystem.write(filePath, 'hello world');
      const content = await fileSystem.read(filePath);
      expect(content).toBe('hello world');
    });
  });

  describe('append', () => {
    it('should append to file', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fileSystem.write(filePath, 'hello');
      await fileSystem.append(filePath, ' world');
      const content = await fileSystem.read(filePath);
      expect(content).toBe('hello world');
    });
  });

  describe('exists', () => {
    it('should detect existing file', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fileSystem.write(filePath, 'data');
      expect(await fileSystem.exists(filePath)).toBe(true);
    });

    it('should detect non-existent file', async () => {
      const filePath = path.join(tempDir, 'missing.txt');
      expect(await fileSystem.exists(filePath)).toBe(false);
    });
  });

  describe('mkdir', () => {
    it('should create nested directories', async () => {
      const dirPath = path.join(tempDir, 'a', 'b', 'c');
      await fileSystem.mkdir(dirPath);
      const filePath = path.join(dirPath, 'test.txt');
      await fileSystem.write(filePath, 'data');
      expect(await fileSystem.exists(filePath)).toBe(true);
    });
  });
});
