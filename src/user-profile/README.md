# User Profile Store

Модуль долгосрочной памяти о пользователях между сессиями.

## Возможности

- 💾 Сохранение фактов о пользователе
- 🔄 Автоматическая загрузка между сессиями
- 🎯 Инъекция контекста в системный промпт
- 🛠️ Tools для управления памятью
- ⏰ Автоматическое истечение временных фактов

## Структура

```
src/user-profile/
├── types.ts                  # TypeScript типы
├── UserProfileStore.ts       # Главный класс
├── profile-tools.ts          # Tools (remember, recall, forget)
└── index.ts                  # Exports
```

## Использование

### 1. Инициализация

```typescript
import { UserProfileStore } from './user-profile';

const userProfileStore = new UserProfileStore({
  profilesDir: '~/.openclone/workspace/users',
  autoSave: true,
  maxFacts: 100,
  factExpiration: 30 * 24 * 60 * 60 * 1000 // 30 days
});

await userProfileStore.init();
```

### 2. Работа с фактами

```typescript
// Запомнить факт
await userProfileStore.rememberFact(
  'telegram:257894688',
  'Живёт в Барселоне',
  { category: 'personal', confidence: 1.0 }
);

// Вспомнить факты
const facts = await userProfileStore.recallFacts('telegram:257894688', {
  category: 'personal',
  limit: 10
});

// Забыть факт
await userProfileStore.forgetFact('telegram:257894688', factId);
```

### 3. Контекст для промпта

```typescript
const userContext = await userProfileStore.buildUserContext('telegram:257894688');
// Возвращает:
// User's name: Артём
// Preferred language: ru
//
// What you know about the user:
// - Живёт в Барселоне
// - Работает разработчиком
// - Интересуется AI
```

## Tools

### `user.remember`
Запомнить факт о пользователе для будущих разговоров.

**Параметры:**
- `fact` (string) - Факт для запоминания
- `category` (optional) - Категория: personal, preference, context, work, temporary, other

**Пример:**
```json
{
  "name": "user.remember",
  "input": {
    "fact": "Меня зовут Артём",
    "category": "personal"
  }
}
```

### `user.recall`
Вспомнить факты о пользователе.

**Параметры:**
- `category` (optional) - Фильтр по категории
- `limit` (optional) - Максимум фактов (default: 10)

**Пример:**
```json
{
  "name": "user.recall",
  "input": {
    "category": "personal",
    "limit": 5
  }
}
```

### `user.forget`
Забыть ранее запомненный факт.

**Параметры:**
- `factId` (string) - ID факта из user.recall

## Интеграция

### Context Assembler

User Profile Store автоматически инъектируется в системный промпт:

```typescript
const contextAssembler = new ContextAssembler({
  sessionStore,
  toolExecutor,
  memoryStore,
  userProfileStore, // ← Добавить
});

// При сборке контекста передать userId
const context = await contextAssembler.assemble(sessionId, agentId, {
  userId: 'telegram:257894688' // ← Важно!
});
```

Системный промпт получит секцию:
```markdown
User's name: Артём
Preferred language: ru

What you know about the user:
- Живёт в Барселоне
- Работает разработчиком
```

### Gateway Bot

```typescript
// Инициализация
const userProfileStore = new UserProfileStore({
  profilesDir: path.join(workspaceDir, 'users'),
  autoSave: true,
});
await userProfileStore.init();

// Регистрация tools
import { registerProfileTools } from './user-profile/profile-tools';
registerProfileTools(toolExecutor, userProfileStore);

// Передача в Context Assembler
const contextAssembler = new ContextAssembler({
  sessionStore,
  toolExecutor,
  memoryStore,
  userProfileStore, // ← Добавить
});
```

## Формат хранения

Файлы сохраняются в `~/.openclone/workspace/users/{userId}.json`:

```json
{
  "userId": "telegram:257894688",
  "name": "Артём",
  "preferences": {
    "language": "ru",
    "timezone": "Europe/Moscow"
  },
  "facts": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "category": "personal",
      "content": "Живёт в Барселоне",
      "confidence": 1.0,
      "source": "user",
      "timestamp": 1738622400000
    }
  ],
  "metadata": {
    "createdAt": 1738622400000,
    "updatedAt": 1738622400000,
    "lastSeenAt": 1738622400000,
    "totalSessions": 5,
    "totalMessages": 42
  }
}
```

## Workflow

1. **Пользователь пишет:** "Меня зовут Артём"
2. **Модель вызывает:** `user.remember { fact: "Зовут Артём" }`
3. **Профиль сохраняется** в `users/telegram_257894688.json`
4. **Новая сессия (на следующий день)**
5. **Context Assembler загружает** профиль
6. **Системный промпт получает:** "User's name: Артём"
7. **Пользователь:** "Как меня зовут?"
8. **Модель:** "Вас зовут Артём!"

## Категории фактов

- `personal` - Имя, возраст, местоположение
- `preference` - Предпочтения, интересы
- `context` - Контекстная информация
- `work` - Работа, проекты
- `temporary` - Временные факты (с истечением)
- `other` - Другое

## API

### UserProfileStore

```typescript
class UserProfileStore {
  async init(): Promise<void>
  async getProfile(userId: string): Promise<UserProfile>
  async rememberFact(userId: string, content: string, options?: RememberFactOptions): Promise<UserFact>
  async recallFacts(userId: string, options?: RecallFactsOptions): Promise<UserFact[]>
  async forgetFact(userId: string, factId: string): Promise<boolean>
  async setUserName(userId: string, name: string): Promise<void>
  async setPreference(userId: string, key: string, value: unknown): Promise<void>
  async buildUserContext(userId: string): Promise<string>
  async listUsers(): Promise<string[]>
}
```

## Примеры

### Запомнить имя
```typescript
await userProfileStore.rememberFact(
  'telegram:257894688',
  'Зовут Артём',
  { category: 'personal' }
);
```

### Запомнить предпочтение
```typescript
await userProfileStore.setPreference(
  'telegram:257894688',
  'language',
  'ru'
);
```

### Временный факт
```typescript
await userProfileStore.rememberFact(
  'telegram:257894688',
  'Ожидает ответ по проекту',
  {
    category: 'temporary',
    expiresIn: 7 * 24 * 60 * 60 * 1000 // 7 дней
  }
);
```

## Лимиты

- Максимум фактов: 100 (настраивается)
- При превышении удаляются старые с низким confidence
- Временные факты автоматически удаляются после истечения
