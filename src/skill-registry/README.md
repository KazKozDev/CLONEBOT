# Skill Registry

Система управления skills — расширениями, которые добавляют агенту новые возможности.

## Статус

🚧 **В разработке** - Модуль 12, Фаза 4

✅ **Готово:**
- Типы и интерфейсы (types.ts)
- SKILL.md Parser (skill-parser.ts)
- Skill Validator (skill-validator.ts)

🔄 **В процессе:**
- Directory Scanner
- Skill Loader
- Skill Store
- SkillRegistry facade

📋 **Запланировано:**
- Precedence Resolver
- Dependency Resolver
- Trigger Matcher
- Activation Manager
- File Watcher & Hot Reload
- Configuration Manager
- ClawHub Client
- Skill Installer/Uninstaller
- Query Engine

## Архитектура

### Three-Tier Precedence

```
1. Workspace skills     ← Highest priority
   {workspace}/skills/
   
2. User/Managed skills  ← Medium priority
   ~/.openclaw/skills/
   
3. Bundled skills       ← Lowest priority
   {install}/skills/
```

При конфликте имён побеждает более высокий приоритет.

### SKILL.md Format

```markdown
---
name: web-research
version: 1.0.0
description: Advanced web research capabilities
author: OpenClaw Team
tags: [research, web, search]
tools:
  - web_search
  - scrape_page
requires:
  - browser
triggers:
  - "research"
  - "find information"
priority: 100
enabled: true
---

# Web Research Skill

Instructions for the agent...

## Instructions

Detailed instructions for the agent...

## When to Use

When the user asks to...

## Examples

### Example 1: Basic Search
...
```

### Skill Directory Structure

```
skill-name/
├── SKILL.md              # Main file (required)
├── tools/                # Tool definitions
│   ├── tool_one.json
│   └── tool_two.json
├── examples/             # Examples
│   ├── example1.md
│   └── example2.md
├── assets/               # Additional files
│   ├── templates/
│   └── data/
└── config.json           # Default configuration
```

## Ключевые компоненты

### 1. SkillParser

Парсинг SKILL.md файлов:
- YAML frontmatter extraction
- Markdown body parsing
- Section extraction (Instructions, Examples, etc.)
- Handles BOM and line endings

```typescript
import { SkillParser } from './skill-parser';

const parser = new SkillParser();
const parsed = await parser.parseFile('/path/to/SKILL.md');

console.log(parsed.frontmatter.name);
console.log(parsed.sections.get('instructions'));
```

### 2. SkillValidator

Валидация skills:
- Schema validation
- Required fields check
- Type validation
- Warnings for recommended fields

```typescript
import { SkillValidator } from './skill-validator';

const validator = new SkillValidator();
const result = validator.validate(parsedSkill);

if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

### 3. DirectoryScanner (TODO)

Обнаружение skills в директориях:
- Recursive SKILL.md search
- Level detection (workspace/user/bundled)
- Modified timestamp tracking

### 4. SkillLoader (TODO)

Загрузка skills:
- Parse SKILL.md
- Load tools from tools/
- Load examples from examples/
- Create Skill object

### 5. PrecedenceResolver (TODO)

Разрешение конфликтов:
- Workspace > User > Bundled
- Override logging
- Version conflict handling

### 6. DependencyResolver (TODO)

Разрешение зависимостей:
- Check `requires` (modules)
- Check `dependencies` (skills)
- Check `conflicts`
- Determine load order
- Circular dependency detection

### 7. SkillStore (TODO)

Хранилище загруженных skills:
- Index by name, tags, triggers
- Fast lookup
- Multiple indexes

### 8. TriggerMatcher (TODO)

Matching триггеров:
- Exact match
- Prefix/suffix/contains
- Regex patterns
- Case-insensitive
- Word boundaries

### 9. ActivationManager (TODO)

Управление активацией:
- Track active skills per session
- Trigger-based activation
- Explicit activation
- AutoActivate handling
- Conflict resolution

### 10. FileWatcher (TODO)

Hot reload для workspace skills:
- Watch directory changes
- Debounce rapid changes
- Trigger reload

### 11. ConfigurationManager (TODO)

Управление конфигурацией:
- Default config from skill
- User overrides
- Session overrides
- Config validation

### 12. ClawHubClient (TODO)

Интеграция с ClawHub registry:
- Search skills
- Get skill info
- Download skills
- Check updates

### 13. SkillInstaller (TODO)

Установка skills:
- From ClawHub
- From Git
- From local path
- Version management
- Dependency installation

### 14. QueryEngine (TODO)

Поиск и фильтрация:
- Multiple criteria
- Full-text search
- Sorting
- Pagination

### 15. SkillRegistry (TODO)

Главный фасад, объединяющий все компоненты:
```typescript
import { SkillRegistry } from './SkillRegistry';

const registry = new SkillRegistry({
  directories: {
    workspace: './skills',
    user: '~/.openclaw/skills',
    bundled: './bundled-skills'
  },
  hotReload: {
    enabled: true
  }
});

await registry.initialize();

// Get skill
const skill = registry.get('web-research');

// Get active skills for context
const activeSkills = registry.getActiveSkills({
  sessionId: 'session-1',
  userMessage: 'I need to research AI'
});

// Get instructions for prompt
const instructions = registry.getAllInstructions(activeSkills);

// Install skill
await registry.install({ type: 'clawhub', slug: 'web-research' });
```

## Интеграция

### С Context Assembler

```typescript
// Skill Registry предоставляет инструкции и tools
const activeSkills = skillRegistry.getActiveSkills(context);
const instructions = skillRegistry.getAllInstructions(activeSkills);
const tools = skillRegistry.getAllTools(activeSkills);

// Context Assembler включает их в prompt
contextAssembler.addSystemInstructions(instructions);
contextAssembler.addTools(tools);
```

### С Tool Executor

```typescript
// Skills могут регистрировать свои tools
const skillTools = skillRegistry.getTools('web-research');

for (const tool of skillTools) {
  toolExecutor.register(tool, handlerFromSkill);
}
```

## Конфигурация

```typescript
{
  directories: {
    workspace: './skills',           // Workspace skills
    user: '~/.openclaw/skills',      // User skills
    bundled: './bundled-skills'      // Bundled skills
  },
  loading: {
    validateOnLoad: true,            // Validate skills on load
    loadTools: true,                 // Load tool definitions
    loadExamples: true               // Load examples
  },
  hotReload: {
    enabled: true,                   // Enable hot reload
    watchDirectories: ['workspace'], // Directories to watch
    debounceMs: 500                  // Debounce delay
  },
  activation: {
    maxActiveSkills: 20,             // Max active skills
    enableTriggerMatching: true,     // Enable trigger matching
    enableSemanticMatching: false    // Semantic trigger matching
  },
  clawhub: {
    enabled: true,                   // Enable ClawHub
    baseUrl: 'https://clawhub.io/api/v1',
    timeout: 30000
  }
}
```

## События

```typescript
registry.on('loaded', ({ skill }) => {
  console.log(`Skill loaded: ${skill}`);
});

registry.on('reloaded', ({ skill }) => {
  console.log(`Skill reloaded: ${skill}`);
});

registry.on('error', ({ skill, error }) => {
  console.error(`Skill error: ${skill}`, error);
});

registry.on('activated', ({ skill, context }) => {
  console.log(`Skill activated: ${skill} for session ${context.sessionId}`);
});
```

## Примеры Skills

### Minimal Skill

```markdown
---
name: hello-world
version: 1.0.0
description: Simple hello world skill
---

# Hello World

Say hello to the user when they greet you.
```

### Complete Skill

```markdown
---
name: web-research
version: 1.0.0
description: Advanced web research capabilities
author: OpenClaw Team
license: MIT
tags: [research, web, search]
category: web
priority: 100
enabled: true

triggers:
  - "research"
  - "find information"
  - "look up"

requires:
  - browser

tools:
  - web_search
  - scrape_page

config:
  maxResults:
    type: number
    default: 5
    description: Maximum search results
---

# Web Research Skill

Advanced capabilities for web research and information gathering.

## Instructions

When the user asks you to research a topic:
1. Use web_search to find relevant information
2. Scrape important pages with scrape_page
3. Synthesize findings into a clear answer
4. Cite your sources

## When to Use

Use this skill when:
- User asks to "research" or "find information"
- Questions require current/recent data
- Need to verify facts

## Examples

### Example 1: Basic Research

**User**: Research the latest AI developments
**Assistant**: *Uses web_search* I found several recent developments...

### Example 2: Fact Checking

**User**: Is it true that...
**Assistant**: *Uses web_search and scrape_page* Let me verify that...
```

## Testing

```bash
npm test skill-registry                # All tests
npm test skill-parser                  # Parser tests
npm test skill-validator              # Validator tests
```

## Дальнейшая разработка

Компоненты для реализации (в порядке приоритета):

1. **DirectoryScanner** - сканирование директорий
2. **SkillLoader** - загрузка skills
3. **SkillStore** - хранилище
4. **SkillRegistry** - главный фасад
5. **PrecedenceResolver** - разрешение приоритетов
6. **DependencyResolver** - разрешение зависимостей
7. **TriggerMatcher** - matching триггеров
8. **ActivationManager** - управление активацией
9. **FileWatcher** - hot reload
10. **ConfigurationManager** - конфигурация
11. **QueryEngine** - поиск
12. **ClawHubClient** - интеграция с registry
13. **SkillInstaller** - установка
14. **SkillUninstaller** - удаление

## Лицензия

MIT
