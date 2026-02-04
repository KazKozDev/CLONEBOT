/**
 * Tests for JSONL file operations
 */

import { JSONLFile } from '../JSONLFile';
import { InMemoryFileSystem } from '../FileSystem';

interface TestData {
  id: number;
  name: string;
}

describe('JSONLFile', () => {
  let fs: InMemoryFileSystem;
  let jsonl: JSONLFile<TestData>;

  beforeEach(() => {
    fs = new InMemoryFileSystem();
    jsonl = new JSONLFile<TestData>(fs, '/test.jsonl');
  });

  describe('append', () => {
    it('should append single object', async () => {
      await jsonl.append({ id: 1, name: 'Alice' });
      const data = await jsonl.readAll();
      expect(data).toEqual([{ id: 1, name: 'Alice' }]);
    });

    it('should append multiple objects', async () => {
      await jsonl.append({ id: 1, name: 'Alice' });
      await jsonl.append({ id: 2, name: 'Bob' });
      const data = await jsonl.readAll();
      expect(data).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
      ]);
    });
  });

  describe('appendMany', () => {
    it('should append multiple objects at once', async () => {
      await jsonl.appendMany([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' }
      ]);
      const data = await jsonl.readAll();
      expect(data).toHaveLength(3);
      expect(data[2].name).toBe('Charlie');
    });
  });

  describe('readAll', () => {
    it('should return empty array for non-existent file', async () => {
      const data = await jsonl.readAll();
      expect(data).toEqual([]);
    });

    it('should parse all lines', async () => {
      await fs.write('/test.jsonl', 
        '{"id":1,"name":"Alice"}\n' +
        '{"id":2,"name":"Bob"}\n' +
        '{"id":3,"name":"Charlie"}\n'
      );
      const data = await jsonl.readAll();
      expect(data).toHaveLength(3);
      expect(data[1].name).toBe('Bob');
    });

    it('should skip invalid JSON lines', async () => {
      await fs.write('/test.jsonl',
        '{"id":1,"name":"Alice"}\n' +
        'invalid json\n' +
        '{"id":2,"name":"Bob"}\n'
      );
      const data = await jsonl.readAll();
      expect(data).toHaveLength(2);
      expect(data[0].name).toBe('Alice');
      expect(data[1].name).toBe('Bob');
    });

    it('should skip empty lines', async () => {
      await fs.write('/test.jsonl',
        '{"id":1,"name":"Alice"}\n' +
        '\n' +
        '{"id":2,"name":"Bob"}\n' +
        '\n'
      );
      const data = await jsonl.readAll();
      expect(data).toHaveLength(2);
    });
  });

  describe('readStream', () => {
    it('should iterate over objects', async () => {
      await jsonl.appendMany([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' }
      ]);

      const results: TestData[] = [];
      for await (const obj of jsonl.readStream()) {
        results.push(obj);
      }

      expect(results).toHaveLength(3);
      expect(results[1].name).toBe('Bob');
    });

    it('should skip invalid lines during streaming', async () => {
      await fs.write('/test.jsonl',
        '{"id":1,"name":"Alice"}\n' +
        'bad line\n' +
        '{"id":2,"name":"Bob"}\n'
      );

      const results: TestData[] = [];
      for await (const obj of jsonl.readStream()) {
        results.push(obj);
      }

      expect(results).toHaveLength(2);
    });
  });

  describe('exists', () => {
    it('should return false for non-existent file', async () => {
      expect(await jsonl.exists()).toBe(false);
    });

    it('should return true after writing', async () => {
      await jsonl.append({ id: 1, name: 'Alice' });
      expect(await jsonl.exists()).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete file', async () => {
      await jsonl.append({ id: 1, name: 'Alice' });
      await jsonl.delete();
      expect(await jsonl.exists()).toBe(false);
    });
  });

  describe('size', () => {
    it('should return 0 for non-existent file', async () => {
      expect(await jsonl.size()).toBe(0);
    });

    it('should return file size', async () => {
      await jsonl.append({ id: 1, name: 'Alice' });
      const size = await jsonl.size();
      expect(size).toBeGreaterThan(0);
    });
  });

  describe('writeAll', () => {
    it('should overwrite file', async () => {
      await jsonl.append({ id: 1, name: 'Alice' });
      await jsonl.writeAll([
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' }
      ]);
      const data = await jsonl.readAll();
      expect(data).toHaveLength(2);
      expect(data[0].id).toBe(2);
    });
  });
});
