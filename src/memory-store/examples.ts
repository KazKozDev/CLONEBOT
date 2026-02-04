/**
 * Memory Store - Usage Examples
 */

import { MemoryStore } from './index';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Example 1: Basic Setup
// ============================================================================

async function example1_BasicSetup() {
  console.log('=== Example 1: Basic Setup ===\n');

  const workspaceDir = path.join(os.homedir(), '.openclone', 'workspace');
  
  const memoryStore = new MemoryStore({
    workspaceDir,
    autoLoad: true
  });

  const result = await memoryStore.init();
  console.log('Initialization result:', result);
  
  const stats = memoryStore.getStats();
  console.log('Workspace stats:', stats);
}

// ============================================================================
// Example 2: Working with Prompts
// ============================================================================

async function example2_Prompts() {
  console.log('\n=== Example 2: Prompts ===\n');

  const memoryStore = new MemoryStore({
    workspaceDir: path.join(os.tmpdir(), 'openclaw-test')
  });

  await memoryStore.init();

  // Установить промпты
  memoryStore.setPrompt('agent', 'You are a helpful AI assistant');
  memoryStore.setPrompt('soul', 'Be friendly and concise');
  memoryStore.setPrompt('tools', 'Use tools when necessary');

  // Получить промпт
  console.log('Agent prompt:', memoryStore.getPrompt('agent'));
  
  // Получить все
  const allPrompts = memoryStore.getAllPrompts();
  console.log('All prompts:', Object.keys(allPrompts));
}

// ============================================================================
// Example 3: Skills Management
// ============================================================================

async function example3_Skills() {
  console.log('\n=== Example 3: Skills ===\n');

  const memoryStore = new MemoryStore({
    workspaceDir: path.join(os.tmpdir(), 'openclaw-test')
  });

  await memoryStore.init();

  // Загрузить навык
  const mathSkill = await memoryStore.loadSkill('math-expert');
  if (mathSkill) {
    console.log('Loaded skill:', mathSkill.name);
    console.log('Title:', mathSkill.title);
    console.log('Tags:', mathSkill.tags);
  }

  // Получить все навыки
  const allSkills = memoryStore.getAllSkills();
  console.log('Total skills:', allSkills.length);

  // Найти по тегам
  const mathSkills = memoryStore.findSkillsByTags(['math']);
  console.log('Math skills:', mathSkills.map(s => s.name));

  // Выгрузить навык
  memoryStore.unloadSkill('math-expert');
  console.log('Skills after unload:', memoryStore.getAllSkills().length);
}

// ============================================================================
// Example 4: Configuration
// ============================================================================

async function example4_Config() {
  console.log('\n=== Example 4: Configuration ===\n');

  const memoryStore = new MemoryStore({
    workspaceDir: path.join(os.tmpdir(), 'openclaw-test')
  });

  await memoryStore.init();

  // Получить конфигурацию
  const config = memoryStore.getConfig();
  console.log('Current config:', config);

  // Обновить
  memoryStore.updateConfig({
    defaultModel: 'gpt-4',
    verbose: true,
    autoReset: {
      enabled: true,
      maxMessages: 100,
      maxTokens: 50000
    }
  });

  // Сохранить
  await memoryStore.saveConfig();
  console.log('Config saved!');

  // Проверить обновления
  const updated = memoryStore.getConfig();
  console.log('Updated model:', updated.defaultModel);
  console.log('Verbose:', updated.verbose);
}

// ============================================================================
// Example 5: Credentials
// ============================================================================

async function example5_Credentials() {
  console.log('\n=== Example 5: Credentials ===\n');

  const memoryStore = new MemoryStore(
    {
      workspaceDir: path.join(os.tmpdir(), 'openclaw-test')
    },
    'my-master-password'  // Мастер-пароль для шифрования
  );

  await memoryStore.init();

  // Установить credentials
  memoryStore.setCredential('telegram_token', 'bot123456:ABC...');
  memoryStore.setCredential('openai_key', 'sk-proj-...');
  memoryStore.setCredential('github_token', 'ghp_...');

  // Получить
  console.log('Telegram token exists:', !!memoryStore.getCredential('telegram_token'));
  
  // Список ключей
  const keys = memoryStore.getCredentialKeys();
  console.log('Credential keys:', keys);

  // Сохранить (шифруется автоматически)
  await memoryStore.saveCredentials();
  console.log('Credentials saved (encrypted)');

  // Удалить
  memoryStore.deleteCredential('github_token');
  console.log('After deletion:', memoryStore.getCredentialKeys());
}

// ============================================================================
// Example 6: Allowlists
// ============================================================================

async function example6_Allowlists() {
  console.log('\n=== Example 6: Allowlists ===\n');

  const memoryStore = new MemoryStore({
    workspaceDir: path.join(os.tmpdir(), 'openclaw-test')
  });

  await memoryStore.init();

  // Добавить пользователей
  memoryStore.allowDM('user123');
  memoryStore.allowDM('user456');
  memoryStore.allowDM('user789');

  // Добавить группы
  memoryStore.allowGroup('group-001');
  memoryStore.allowGroup('group-002');

  // Проверить доступ
  console.log('User123 allowed:', memoryStore.isDMAllowed('user123'));
  console.log('User999 allowed:', memoryStore.isDMAllowed('user999'));
  console.log('Group001 allowed:', memoryStore.isGroupAllowed('group-001'));

  // Получить все
  const allowlists = memoryStore.getAllowlists();
  console.log('DM allowlist:', allowlists.dm);
  console.log('Group allowlist:', allowlists.groups);

  // Сохранить
  await memoryStore.saveAllowlists();
  console.log('Allowlists saved!');
}

// ============================================================================
// Example 7: Full Reload
// ============================================================================

async function example7_Reload() {
  console.log('\n=== Example 7: Full Reload ===\n');

  const memoryStore = new MemoryStore({
    workspaceDir: path.join(os.homedir(), '.openclone', 'workspace'),
    autoLoad: true
  });

  await memoryStore.init();
  console.log('Initial stats:', memoryStore.getStats());

  // Перезагрузить всю память
  console.log('\nReloading...');
  const result = await memoryStore.reload();
  
  console.log('Reload result:', {
    success: result.success,
    promptsLoaded: result.promptsLoaded,
    skillsLoaded: result.skillsLoaded,
    configLoaded: result.configLoaded
  });

  console.log('Updated stats:', memoryStore.getStats());
}

// ============================================================================
// Example 8: Integration with Agent
// ============================================================================

async function example8_AgentIntegration() {
  console.log('\n=== Example 8: Agent Integration ===\n');

  const memoryStore = new MemoryStore({
    workspaceDir: path.join(os.homedir(), '.openclone', 'workspace'),
    autoLoad: true
  });

  await memoryStore.init();

  // Загрузить промпты для агента
  const systemPrompt = memoryStore.getPrompt('agent') || 'Default agent prompt';
  const soulPrompt = memoryStore.getPrompt('soul') || 'Default soul';

  console.log('System prompt loaded:', systemPrompt.substring(0, 50) + '...');
  console.log('Soul prompt loaded:', soulPrompt.substring(0, 50) + '...');

  // Загрузить конфигурацию
  const config = memoryStore.getConfig();
  console.log('Using model:', config.defaultModel);
  console.log('Thinking level:', config.thinkingLevel);

  // Загрузить credentials
  const telegramToken = memoryStore.getCredential('telegram_token');
  if (telegramToken) {
    console.log('Telegram token available');
  }

  // Загрузить навыки по запросу
  const activeSkills: string[] = [];
  
  // Например, пользователь попросил помощь с математикой
  const mathSkill = await memoryStore.loadSkill('math-expert');
  if (mathSkill) {
    activeSkills.push(mathSkill.name);
    console.log('Activated skill:', mathSkill.title);
  }

  console.log('Active skills:', activeSkills);
}

// ============================================================================
// Run all examples
// ============================================================================

async function runAllExamples() {
  try {
    await example1_BasicSetup();
    await example2_Prompts();
    await example3_Skills();
    await example4_Config();
    await example5_Credentials();
    await example6_Allowlists();
    await example7_Reload();
    await example8_AgentIntegration();
    
    console.log('\n✅ All examples completed!');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Uncomment to run:
// runAllExamples();
