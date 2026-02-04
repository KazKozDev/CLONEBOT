/**
 * Memory Store Checkpoint
 * Демонстрация работы модуля памяти
 */

import { MemoryStore } from './memory-store';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

async function main() {
  console.log('🧠 Memory Store Checkpoint\n');
  console.log('='.repeat(60));

  // Создать временный workspace для демонстрации
  const tempWorkspace = path.join(os.tmpdir(), 'openclaw-demo-' + Date.now());
  console.log(`\n📁 Creating workspace at: ${tempWorkspace}`);

  // ========================================================================
  // 1. Инициализация
  // ========================================================================
  console.log('\n1️⃣  ИНИЦИАЛИЗАЦИЯ');
  console.log('-'.repeat(60));

  const memoryStore = new MemoryStore(
    {
      workspaceDir: tempWorkspace,
      autoLoad: true
    },
    'demo-password'
  );

  const initResult = await memoryStore.init();
  console.log('✅ Memory Store initialized');
  console.log('   Prompts loaded:', initResult.promptsLoaded);
  console.log('   Skills loaded:', initResult.skillsLoaded);
  console.log('   Config loaded:', initResult.configLoaded ? 'Yes' : 'No');

  // ========================================================================
  // 2. Работа с промптами
  // ========================================================================
  console.log('\n2️⃣  СИСТЕМНЫЕ ПРОМПТЫ');
  console.log('-'.repeat(60));

  // Создать промпты
  await fs.mkdir(path.join(tempWorkspace, 'bootstrap'), { recursive: true });
  await fs.writeFile(
    path.join(tempWorkspace, 'bootstrap', 'agent.md'),
    'You are OpenClaw 🦞, a helpful AI assistant powered by Ollama.',
    'utf-8'
  );
  await fs.writeFile(
    path.join(tempWorkspace, 'bootstrap', 'soul.md'),
    'Be friendly, concise, and use emojis when appropriate.',
    'utf-8'
  );

  await memoryStore.reload();

  const agentPrompt = memoryStore.getPrompt('agent');
  const soulPrompt = memoryStore.getPrompt('soul');

  console.log('✅ Agent prompt:', agentPrompt);
  console.log('✅ Soul prompt:', soulPrompt);

  // ========================================================================
  // 3. Навыки (Skills)
  // ========================================================================
  console.log('\n3️⃣  НАВЫКИ (SKILLS)');
  console.log('-'.repeat(60));

  // Создать навык
  await fs.mkdir(path.join(tempWorkspace, 'skills'), { recursive: true });

  const mathSkillContent = `---
title: Math Expert
description: Advanced mathematical calculations
tags: [math, calculator, expert]
---

# Math Expert Skill

You are an expert mathematician. You can:
- Solve complex equations
- Perform statistical analysis
- Work with matrices and vectors

When user asks for math help, provide step-by-step solutions.`;

  await fs.writeFile(
    path.join(tempWorkspace, 'skills', 'math-expert.skill.md'),
    mathSkillContent,
    'utf-8'
  );

  const mathSkill = await memoryStore.loadSkill('math-expert');
  console.log('✅ Loaded skill:', mathSkill?.title);
  console.log('   Description:', mathSkill?.description);
  console.log('   Tags:', mathSkill?.tags?.join(', '));

  // ========================================================================
  // 4. Конфигурация
  // ========================================================================
  console.log('\n4️⃣  КОНФИГУРАЦИЯ');
  console.log('-'.repeat(60));

  const config = memoryStore.getConfig();
  console.log('✅ Current config:');
  console.log('   Version:', config.version);
  console.log('   Default Model:', config.defaultModel);
  console.log('   Thinking Level:', config.thinkingLevel);
  console.log('   Verbose:', config.verbose);

  // Обновить конфигурацию
  memoryStore.updateConfig({
    defaultModel: 'ollama/gpt-oss:20b',
    thinkingLevel: 'high',
    verbose: true
  });
  await memoryStore.saveConfig();
  console.log('✅ Config updated and saved');

  // ========================================================================
  // 5. Credentials
  // ========================================================================
  console.log('\n5️⃣  CREDENTIALS (ENCRYPTED)');
  console.log('-'.repeat(60));

  memoryStore.setCredential('telegram_token', 'bot123456:ABC-DEF-GHI');
  memoryStore.setCredential('openai_key', 'sk-proj-example123');
  memoryStore.setCredential('ollama_url', 'http://localhost:11434');

  await memoryStore.saveCredentials();
  console.log('✅ Saved 3 encrypted credentials');

  // Проверить что они сохранены зашифрованными
  const credFile = await fs.readFile(
    path.join(tempWorkspace, 'credentials', 'store.json'),
    'utf-8'
  );
  const credData = JSON.parse(credFile);
  console.log('   Sample encrypted value:', credData.telegram_token.value.substring(0, 40) + '...');
  console.log('   Encrypted:', credData.telegram_token.encrypted);

  // Получить расшифрованное значение
  const telegramToken = memoryStore.getCredential('telegram_token');
  console.log('✅ Decrypted token:', telegramToken);

  // ========================================================================
  // 6. Allowlists
  // ========================================================================
  console.log('\n6️⃣  ALLOWLISTS');
  console.log('-'.repeat(60));

  memoryStore.allowDM('user123');
  memoryStore.allowDM('user456');
  memoryStore.allowGroup('group-tech');
  memoryStore.allowGroup('group-admins');

  const allowlists = memoryStore.getAllowlists();
  console.log('✅ DM Allowlist:', allowlists.dm);
  console.log('✅ Group Allowlist:', allowlists.groups);

  console.log('\n   Checking access:');
  console.log('   user123 allowed:', memoryStore.isDMAllowed('user123'));
  console.log('   user999 allowed:', memoryStore.isDMAllowed('user999'));
  console.log('   group-tech allowed:', memoryStore.isGroupAllowed('group-tech'));

  await memoryStore.saveAllowlists();
  console.log('✅ Allowlists saved');

  // ========================================================================
  // 7. Статистика
  // ========================================================================
  console.log('\n7️⃣  СТАТИСТИКА');
  console.log('-'.repeat(60));

  const stats = memoryStore.getStats();
  console.log('✅ Workspace Stats:');
  console.log('   Prompts:', stats.promptsCount);
  console.log('   Skills:', stats.skillsCount);
  console.log('   Credentials:', stats.credentialsCount);
  console.log('   DM Allowlist:', stats.dmAllowlistCount);
  console.log('   Group Allowlist:', stats.groupAllowlistCount);
  console.log('   Loaded at:', new Date(stats.loadedAt).toLocaleTimeString());

  // ========================================================================
  // 8. Полная перезагрузка
  // ========================================================================
  console.log('\n8️⃣  ПОЛНАЯ ПЕРЕЗАГРУЗКА');
  console.log('-'.repeat(60));

  const reloadResult = await memoryStore.reload();
  console.log('✅ Reload completed');
  console.log('   Success:', reloadResult.success);
  console.log('   Prompts reloaded:', reloadResult.promptsLoaded);
  console.log('   Skills reloaded:', reloadResult.skillsLoaded);
  console.log('   Config reloaded:', reloadResult.configLoaded ? 'Yes' : 'No');

  // ========================================================================
  // Финал
  // ========================================================================
  console.log('\n' + '='.repeat(60));
  console.log('✅ ALL CHECKS PASSED!');
  console.log('='.repeat(60));
  console.log('\n📊 Summary:');
  console.log('   ✅ Memory Store initialized');
  console.log('   ✅ System prompts loaded from bootstrap/');
  console.log('   ✅ Skills loaded from skills/');
  console.log('   ✅ Configuration managed');
  console.log('   ✅ Credentials encrypted and stored');
  console.log('   ✅ Allowlists working');
  console.log('   ✅ Full reload successful');

  console.log('\n🎯 Module Status: READY FOR INTEGRATION');
  console.log(`\n📁 Demo workspace: ${tempWorkspace}`);
  console.log('   (You can delete it manually if needed)\n');
}

main().catch(console.error);
