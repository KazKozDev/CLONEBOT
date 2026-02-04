/**
 * Memory Store Tests - Credential Manager
 */

import { CredentialManager } from '../CredentialManager';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('CredentialManager', () => {
  let tempDir: string;
  let manager: CredentialManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cred-manager-test-'));
    manager = new CredentialManager(tempDir, 'test-password');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('should set and get credentials', () => {
    manager.set('api_key', 'secret123');
    manager.set('token', 'abc456');

    expect(manager.get('api_key')).toBe('secret123');
    expect(manager.get('token')).toBe('abc456');
    expect(manager.get('missing')).toBeUndefined();
  });

  test('should check credential existence', () => {
    manager.set('test', 'value');

    expect(manager.has('test')).toBe(true);
    expect(manager.has('missing')).toBe(false);
  });

  test('should delete credentials', () => {
    manager.set('temp', 'value');
    expect(manager.has('temp')).toBe(true);

    const deleted = manager.delete('temp');
    expect(deleted).toBe(true);
    expect(manager.has('temp')).toBe(false);
    expect(manager.get('temp')).toBeUndefined();
  });

  test('should list credential keys', () => {
    manager.set('key1', 'val1');
    manager.set('key2', 'val2');
    manager.set('key3', 'val3');

    const keys = manager.keys();
    expect(keys.length).toBe(3);
    expect(keys).toContain('key1');
    expect(keys).toContain('key2');
    expect(keys).toContain('key3');
  });

  test('should clear all credentials', () => {
    manager.set('key1', 'val1');
    manager.set('key2', 'val2');

    expect(manager.keys().length).toBe(2);

    manager.clear();
    expect(manager.keys().length).toBe(0);
    expect(manager.get('key1')).toBeUndefined();
  });

  test('should save and load credentials', async () => {
    manager.set('api_key', 'secret123');
    manager.set('token', 'token456');

    await manager.save();

    // Проверить что файл создан
    const storePath = path.join(tempDir, 'credentials', 'store.json');
    const exists = await fs.stat(storePath);
    expect(exists.isFile()).toBe(true);

    // Создать новый manager и загрузить
    const newManager = new CredentialManager(tempDir, 'test-password');
    await newManager.load();

    expect(newManager.get('api_key')).toBe('secret123');
    expect(newManager.get('token')).toBe('token456');
  });

  test('should encrypt credentials when saving', async () => {
    manager.set('secret', 'plaintext');
    await manager.save();

    // Прочитать файл напрямую
    const storePath = path.join(tempDir, 'credentials', 'store.json');
    const content = await fs.readFile(storePath, 'utf-8');
    const data = JSON.parse(content);

    // Значение должно быть зашифровано
    expect(data.secret.value).not.toBe('plaintext');
    expect(data.secret.encrypted).toBe(true);
  });

  test('should handle missing credentials file', async () => {
    // Загрузить когда файла нет
    await manager.load();

    // Не должно быть ошибок
    expect(manager.keys().length).toBe(0);
  });

  test('should fail to decrypt with wrong password', async () => {
    manager.set('test', 'value');
    await manager.save();

    // Загрузить с другим паролем
    const wrongManager = new CredentialManager(tempDir, 'wrong-password');
    
    // Должна быть ошибка при расшифровке
    await expect(wrongManager.load()).rejects.toThrow();
  });

  test('should update credential timestamp', () => {
    const before = Date.now();
    manager.set('key', 'value1');
    
    // Небольшая задержка
    const entry1 = (manager as any).credentials.get('key');
    const created = entry1.createdAt;
    
    // Обновить
    manager.set('key', 'value2');
    const entry2 = (manager as any).credentials.get('key');
    
    expect(entry2.createdAt).toBe(created); // Не изменилось
    expect(entry2.updatedAt).toBeGreaterThanOrEqual(before);
  });
});
