/**
 * Memory Store Tests - Basic Usage
 */

import { MemoryStore } from '../MemoryStore';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('MemoryStore - Basic Usage', () => {
  let tempDir: string;
  let memoryStore: MemoryStore;

  beforeEach(async () => {
    // Создать временную директорию для тестов
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-store-test-'));
    
    memoryStore = new MemoryStore({
      workspaceDir: tempDir,
      autoLoad: false
    });

    await memoryStore.init();
  });

  afterEach(async () => {
    // Очистить временную директорию
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('should initialize empty workspace', async () => {
    const stats = memoryStore.getStats();
    
    expect(stats.promptsCount).toBe(0);
    expect(stats.skillsCount).toBe(0);
    expect(stats.credentialsCount).toBe(0);
  });

  test('should create workspace structure', async () => {
    const bootstrapDir = path.join(tempDir, 'bootstrap');
    const skillsDir = path.join(tempDir, 'skills');
    const credentialsDir = path.join(tempDir, 'credentials');
    
    const [bootstrap, skills, credentials] = await Promise.all([
      fs.stat(bootstrapDir),
      fs.stat(skillsDir),
      fs.stat(credentialsDir)
    ]);

    expect(bootstrap.isDirectory()).toBe(true);
    expect(skills.isDirectory()).toBe(true);
    expect(credentials.isDirectory()).toBe(true);
  });

  test('should load default config', async () => {
    // Загрузить конфиг вручную т.к. autoLoad: false
    await memoryStore.reload();
    
    const config = memoryStore.getConfig();
    
    expect(config.version).toBe('1.0.0');
    expect(config.defaultModel).toBe('llama3.2');
    expect(config.autoReset?.enabled).toBe(true);
  });

  test('should update and save config', async () => {
    memoryStore.updateConfig({
      defaultModel: 'gpt-4',
      verbose: true
    });

    await memoryStore.saveConfig();

    // Создать новый instance и загрузить
    const newStore = new MemoryStore({
      workspaceDir: tempDir,
      autoLoad: true
    });
    await newStore.init();

    const config = newStore.getConfig();
    expect(config.defaultModel).toBe('gpt-4');
    expect(config.verbose).toBe(true);
  });

  test('should set and get prompts', () => {
    memoryStore.setPrompt('agent', 'You are a helpful assistant');
    memoryStore.setPrompt('soul', 'Be friendly and concise');

    expect(memoryStore.getPrompt('agent')).toBe('You are a helpful assistant');
    expect(memoryStore.getPrompt('soul')).toBe('Be friendly and concise');
    
    const allPrompts = memoryStore.getAllPrompts();
    expect(Object.keys(allPrompts).length).toBe(2);
  });

  test('should manage credentials', async () => {
    memoryStore.setCredential('telegram_token', 'secret123');
    memoryStore.setCredential('openai_key', 'sk-abc');

    expect(memoryStore.getCredential('telegram_token')).toBe('secret123');
    expect(memoryStore.getCredentialKeys().length).toBe(2);

    // Сохранить и перезагрузить
    await memoryStore.saveCredentials();

    const newStore = new MemoryStore({
      workspaceDir: tempDir,
      autoLoad: true
    });
    await newStore.init();

    expect(newStore.getCredential('telegram_token')).toBe('secret123');
    expect(newStore.getCredential('openai_key')).toBe('sk-abc');
  });

  test('should delete credentials', async () => {
    memoryStore.setCredential('test', 'value');
    expect(memoryStore.getCredential('test')).toBe('value');

    const deleted = memoryStore.deleteCredential('test');
    expect(deleted).toBe(true);
    expect(memoryStore.getCredential('test')).toBeUndefined();
  });

  test('should manage allowlists', async () => {
    memoryStore.allowDM('user123');
    memoryStore.allowDM('user456');
    memoryStore.allowGroup('group789');

    expect(memoryStore.isDMAllowed('user123')).toBe(true);
    expect(memoryStore.isDMAllowed('user999')).toBe(false);
    expect(memoryStore.isGroupAllowed('group789')).toBe(true);

    const allowlists = memoryStore.getAllowlists();
    expect(allowlists.dm.length).toBe(2);
    expect(allowlists.groups.length).toBe(1);

    // Сохранить и проверить
    await memoryStore.saveAllowlists();
    
    const saved = await fs.readFile(
      path.join(tempDir, 'allowlists.json'),
      'utf-8'
    );
    const parsed = JSON.parse(saved);
    expect(parsed.dm).toContain('user123');
  });
});
