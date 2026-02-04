# Memory Store Module

**Долгосрочное хранилище для промптов, навыков и конфигураций**

Memory Store - это модуль для управления персистентной памятью AI бота, включая системные промпты, навыки, конфигурации, credentials и allowlists.

## 🎯 Основные возможности

- ✅ **Системные промпты** - загрузка из `bootstrap/*.md`
- ✅ **Навыки (Skills)** - динамическая загрузка из `skills/*.skill.md`
- ✅ **Конфигурация** - хранение настроек в `openclaw.json`
- ✅ **Credentials** - зашифрованное хранение токенов и ключей
- ✅ **Allowlists** - контроль доступа для DM и групп
- ✅ **Auto-reload** - перезагрузка без перезапуска бота

## 📦 Установка

```typescript
import { MemoryStore } from './src/memory-store';
import * as path from 'path';
import * as os from 'os';

const workspaceDir = path.join(os.homedir(), '.openclone', 'workspace');

const memoryStore = new MemoryStore(
  {
    workspaceDir,
    autoLoad: true,      // Автозагрузка при инициализации
    watchFiles: false    // Следить за изменениями (будущая функция)
  },
  'your-master-password'  // Для шифрования credentials
);

await memoryStore.init();
```

## 🚀 Быстрый старт

### 1. Работа с системными промптами

```typescript
// Загрузить все промпты из bootstrap/
await memoryStore.reload();

// Получить промпт
const agentPrompt = memoryStore.getPrompt('agent');
const soulPrompt = memoryStore.getPrompt('soul');

// Установить промпт в runtime
memoryStore.setPrompt('custom', 'Your custom prompt');

// Получить все
const allPrompts = memoryStore.getAllPrompts();
```

### 2. Управление навыками (Skills)

```typescript
// Загрузить конкретный навык
const mathSkill = await memoryStore.loadSkill('math-expert');

// Получить навык
const skill = memoryStore.getSkill('math-expert');
console.log(skill.content);

// Получить все навыки
const allSkills = memoryStore.getAllSkills();

// Найти по тегам
const mathSkills = memoryStore.findSkillsByTags(['math', 'calculator']);

// Выгрузить навык
memoryStore.unloadSkill('math-expert');

// Перезагрузить навык
await memoryStore.loadSkill('math-expert', { overwrite: true });
```

### 3. Конфигурация

```typescript
// Получить текущую конфигурацию
const config = memoryStore.getConfig();

// Обновить настройки
memoryStore.updateConfig({
  defaultModel: 'gpt-4',
  verbose: true,
  autoReset: {
    enabled: true,
    maxMessages: 100,
    maxTokens: 50000
  }
});

// Сохранить в файл
await memoryStore.saveConfig();
```

### 4. Credentials (зашифрованное хранение)

```typescript
// Установить credential
memoryStore.setCredential('telegram_token', 'your-bot-token');
memoryStore.setCredential('openai_key', 'sk-...');

// Получить credential
const token = memoryStore.getCredential('telegram_token');

// Список ключей
const keys = memoryStore.getCredentialKeys();

// Удалить
memoryStore.deleteCredential('old_key');

// Сохранить (шифруется автоматически)
await memoryStore.saveCredentials();
```

### 5. Allowlists

```typescript
// Добавить пользователя в DM allowlist
memoryStore.allowDM('user123');
memoryStore.allowDM('user456');

// Добавить группу
memoryStore.allowGroup('group789');

// Проверить доступ
if (memoryStore.isDMAllowed('user123')) {
  console.log('User allowed for DM');
}

if (memoryStore.isGroupAllowed('group789')) {
  console.log('Group allowed');
}

// Получить все
const allowlists = memoryStore.getAllowlists();

// Сохранить
await memoryStore.saveAllowlists();
```

## 📁 Структура workspace

```
~/.openclone/workspace/
├── bootstrap/              # Системные промпты
│   ├── agent.md
│   ├── soul.md
│   ├── tools.md
│   └── identity.md
├── skills/                 # Навыки
│   ├── math-expert.skill.md
│   ├── weather-helper.skill.md
│   └── web-navigator.skill.md
├── credentials/            # Зашифрованные данные
│   └── store.json
├── openclaw.json          # Конфигурация
└── allowlists.json        # Списки доступа
```

## 📝 Формат Skill файла

```markdown
---
title: Math Expert
description: Advanced mathematical calculations
tags: [math, calculator, expert]
---

# Math Expert Skill

You are an expert mathematician. You can:
- Solve complex equations
- Perform statistical analysis
- Work with matrices and vectors

## Usage

When user asks for math help, provide detailed step-by-step solutions.
```

## 🔐 Безопасность Credentials

Credentials шифруются с помощью **AES-256-GCM** перед сохранением:

```typescript
// При инициализации укажите мастер-пароль
const store = new MemoryStore(config, 'strong-master-password');

// Credentials автоматически шифруются при сохранении
store.setCredential('api_key', 'secret123');
await store.saveCredentials();

// Расшифровываются при загрузке
await store.init();
const key = store.getCredential('api_key'); // -> 'secret123'
```

⚠️ **Важно:** В продакшене используйте надежное хранилище ключей (keytar, OS keychain).

## 📊 Статистика

```typescript
const stats = memoryStore.getStats();

console.log(stats);
// {
//   promptsCount: 4,
//   skillsCount: 5,
//   credentialsCount: 3,
//   dmAllowlistCount: 2,
//   groupAllowlistCount: 1,
//   loadedAt: 1738540800000
// }
```

## 🔄 Полная перезагрузка

```typescript
// Перезагрузить всю память из файловой системы
const result = await memoryStore.reload();

console.log(result);
// {
//   success: true,
//   promptsLoaded: 4,
//   skillsLoaded: 5,
//   configLoaded: true,
//   errors: undefined
// }
```

## 🧪 Тестирование

```bash
# Запустить все тесты
npm test -- src/memory-store/__tests__/

# Запустить конкретный тест
npm test -- src/memory-store/__tests__/01-basic-usage.test.ts

# С coverage
npm run test:coverage -- src/memory-store/
```

## 📖 API Reference

### MemoryStore

#### Методы инициализации

- `init(): Promise<LoadResult>` - инициализировать store
- `reload(): Promise<LoadResult>` - перезагрузить из файлов

#### Prompts

- `getPrompt(key: string): string | undefined`
- `getAllPrompts(): SystemPrompts`
- `setPrompt(key: string, content: string): void`

#### Skills

- `getSkill(id: string): Skill | undefined`
- `getAllSkills(): Skill[]`
- `loadSkill(name: string, options?: SkillLoadOptions): Promise<Skill | null>`
- `unloadSkill(id: string): boolean`
- `findSkillsByTags(tags: string[]): Skill[]`

#### Config

- `getConfig(): BotConfig`
- `updateConfig(updates: Partial<BotConfig>): void`
- `saveConfig(): Promise<void>`

#### Credentials

- `setCredential(key: string, value: string): void`
- `getCredential(key: string): string | undefined`
- `deleteCredential(key: string): boolean`
- `getCredentialKeys(): string[]`
- `saveCredentials(): Promise<void>`

#### Allowlists

- `allowDM(userId: string): void`
- `allowGroup(groupId: string): void`
- `isDMAllowed(userId: string): boolean`
- `isGroupAllowed(groupId: string): boolean`
- `getAllowlists(): Allowlists`
- `saveAllowlists(): Promise<void>`

#### Utility

- `getStats(): object` - получить статистику
- `getWorkspace(): Workspace` - экспорт всего workspace

## 🔗 Интеграция с другими модулями

### Context Assembler

```typescript
import { MemoryStore } from './memory-store';
import { ContextAssembler } from './context-assembler';

const memoryStore = new MemoryStore(config);
await memoryStore.init();

// Использовать промпты в контексте
const assembler = new ContextAssembler({
  systemPrompt: memoryStore.getPrompt('agent'),
  additionalContext: memoryStore.getPrompt('soul')
});
```

### Agent Loop

```typescript
import { AgentLoop } from './agent-loop';

const agentLoop = new AgentLoop({
  modelAdapter,
  toolExecutor,
  contextAssembler,
  memoryStore  // Передать memory store
});

// Agent может динамически загружать навыки
const skill = await memoryStore.loadSkill('math-expert');
```

## 🎨 Примеры использования

См. файлы в `examples/`:
- `examples/01-basic-setup.ts` - базовая настройка
- `examples/02-skills.ts` - работа с навыками
- `examples/03-credentials.ts` - управление credentials
- `examples/04-integration.ts` - интеграция с Agent Loop

## 🐛 Troubleshooting

**Ошибка: "MemoryStore already initialized"**
- Не вызывайте `init()` дважды

**Ошибка: "Failed to decrypt credentials"**
- Проверьте мастер-пароль
- Убедитесь что используете тот же пароль что при сохранении

**Skills не загружаются**
- Проверьте расширение файла: должно быть `.skill.md`
- Убедитесь что файлы в директории `skills/`

## 📚 Дополнительные ресурсы

- [Session Store](../session-store/README.md) - краткосрочная память
- [Context Assembler](../context-assembler/README.md) - сборка контекста
- [Agent Loop](../agent-loop/README.md) - главный оркестратор

---

**Автор:** OpenClaw Team  
**Версия:** 1.0.0  
**Дата:** 2026-02-03
