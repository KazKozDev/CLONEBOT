# Session Store - Architecture

## 📐 Архитектурный обзор

Session Store - это модуль для управления сессиями диалогов с древовидной структурой сообщений. Модуль спроектирован для надежного хранения, эффективного доступа и безопасной конкурентной работы с сессиями.

## 🎯 Дизайн-принципы

### 1. **Append-Only Storage**
Все сообщения записываются только в конец файла (append-only), что обеспечивает:
- **Crash safety** - никогда не теряем данные при сбоях
- **Простота реализации** - не нужна сложная логика обновлений
- **Аудит** - полная история всех изменений

### 2. **Tree Structure**
Каждое сообщение может иметь несколько дочерних через `parentId`:
- Поддержка ветвления разговоров
- Альтернативные ответы ассистента
- Исследование разных путей диалога

### 3. **Separation of Concerns**
Модуль разделен на независимые компоненты:
- **FileSystem** - абстракция файловой системы
- **JSONLFile** - работа с JSONL форматом
- **SessionIndex** - индекс сессий
- **LockManager** - управление блокировками
- **AutoReset** - логика автосброса
- **SessionStore** - главный оркестратор

### 4. **Testability First**
InMemoryFileSystem позволяет:
- Быстрые юнит-тесты без I/O
- Детерминированные тесты
- Простую изоляцию компонентов

## 📦 Компоненты

### FileSystem Abstraction

```typescript
interface FileSystem {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
  list(dirPath: string): Promise<string[]>;
  mkdir(dirPath: string): Promise<void>;
  stat(path: string): Promise<FileStats>;
}
```

**Реализации:**
- `RealFileSystem` - использует Node.js `fs/promises`
- `InMemoryFileSystem` - хранит данные в `Map<string, {content, mtime}>`

**Дизайн-решение:** Абстракция позволяет:
- Тестировать без реальной FS
- Легко добавить другие backend'ы (S3, Redis и т.д.)
- Изолировать I/O логику

### JSONLFile

Утилита для работы с JSON Lines форматом:

```typescript
class JSONLFile<T> {
  async append(obj: T): Promise<void>
  async appendMany(objects: T[]): Promise<void>
  async readAll(): Promise<T[]>
  async *readStream(): AsyncIterableIterator<T>
  async writeAll(objects: T[]): Promise<void>
}
```

**Особенности:**
- Каждая строка = отдельный JSON объект
- Graceful обработка поврежденных строк
- Поддержка streaming для больших файлов
- Автоматический пропуск пустых строк

**Формат:**
```jsonl
{"id":"msg-1","content":"Hello"}
{"id":"msg-2","content":"World"}
```

### SessionIndex

Управляет отображением session keys → session IDs:

```typescript
class SessionIndexManager {
  async load(): Promise<void>
  async save(): Promise<void>  // Debounced
  
  getSessionId(key: string): string | undefined
  getMetadata(sessionId: string): SessionMetadata | undefined
  
  async registerSession(id, key, metadata): Promise<void>
  async updateMetadata(id, updates): Promise<void>
  async deleteSession(id): Promise<void>
}
```

**Структура sessions.json:**
```json
{
  "keys": {
    "user:alice": "session-uuid-1",
    "telegram:123": "session-uuid-2"
  },
  "sessions": {
    "session-uuid-1": {
      "sessionId": "session-uuid-1",
      "createdAt": 1234567890,
      "updatedAt": 1234567890,
      "messageCount": 42
    }
  }
}
```

**Оптимизации:**
- Debounced save (по умолчанию 100ms)
- In-memory кеш для быстрого доступа
- Загрузка один раз при инициализации

### LockManager

Предотвращает race conditions при конкурентном доступе:

```typescript
class LockManager {
  async acquire(sessionId, ownerId): Promise<LockResult>
  async release(sessionId, ownerId): Promise<boolean>
  isLocked(sessionId): boolean
  cleanup(): number  // Remove expired locks
}
```

**Механизм блокировок:**
```typescript
interface Lock {
  sessionId: string;
  ownerId: string;
  acquiredAt: number;  // Timestamp
}
```

- Один владелец на сессию
- Автоматический timeout (по умолчанию 30 сек)
- Refresh при повторном acquire тем же owner'ом
- Helper `withLock()` для автоматического освобождения

**Сценарий работы:**
1. Worker-1 захватывает lock
2. Worker-2 пытается захватить → получает `acquired: false`
3. Worker-1 завершает работу и освобождает lock
4. Worker-2 повторяет попытку → успех

### AutoResetManager

Автоматический сброс сессий по условиям:

```typescript
class AutoResetManager {
  checkAndReset(messages): { reset: boolean; messages: Message[] }
  updateConfig(updates): void
}
```

**Триггеры сброса:**
- `maxMessages` - максимальное количество сообщений
- `maxAgeMs` - максимальный возраст первого сообщения
- `maxTokens` - максимальное количество токенов (с custom counter)

**Стратегии сохранения:**
- `none` - удалить все
- `first` - сохранить первые N
- `last` - сохранить последние N
- `system` - сохранить только system messages

**Опции:**
- `insertResetMarker` - добавить маркер сброса
- `keepCount` - сколько сообщений оставить

### SessionStore

Главный класс-оркестратор:

```typescript
class SessionStore {
  // Lifecycle
  async init(): Promise<void>
  async flush(): Promise<void>
  
  // Session management
  async resolve(key): Promise<string>
  async deleteSession(id): Promise<void>
  
  // Messages
  async append(id, message): Promise<Message>
  async getMessages(id): Promise<Message[]>
  async getLinearHistory(id, leafId): Promise<Message[]>
  
  // Tree operations
  async getChildren(id, messageId): Promise<Message[]>
  async getTree(id, rootId?): Promise<Message[]>
  
  // Branching
  async createBranch(id, name, leafId): Promise<Branch>
  async getBranches(id): Promise<Branch[]>
  async switchToBranch(id, name): Promise<string>
  
  // Locking
  async acquireLock(id, owner): Promise<LockResult>
  async releaseLock(id, owner): Promise<boolean>
  async withLock<T>(id, owner, fn): Promise<T>
}
```

## 🗂️ Структура данных

### Message (Tree Node)

```typescript
interface Message {
  id: string;                    // Unique ID
  parentId: string | null;       // Parent message (null = root)
  type: MessageType;             // user | assistant | system | tool_*
  timestamp: number;             // Unix timestamp (ms)
  
  role?: MessageRole;            // user | assistant | system
  content?: string | ContentBlock[];
  toolCalls?: ToolCall[];
  toolResult?: ToolResult;
  
  metadata?: Record<string, unknown>;
}
```

**Дерево строится через `parentId`:**
```
null (root)
  ├─ msg-1 (user question)
  │   ├─ msg-2 (assistant answer A)
  │   │   └─ msg-4 (user follow-up)
  │   └─ msg-3 (assistant answer B - альтернатива)
  └─ msg-5 (другая ветка диалога)
```

### Branch

```typescript
interface Branch {
  name: string;          // Branch name
  leafMessageId: string; // ID последнего сообщения в ветке
  createdAt: number;     // Timestamp
  path: string[];        // [msg-1, msg-2, msg-3] - путь от корня
}
```

Ветки используются для:
- Сохранения интересных путей диалога
- Быстрого переключения между вариантами
- Исследования альтернатив

### SessionMetadata

```typescript
interface SessionMetadata {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  tokenEstimate?: number;
  modelOverrides?: ModelOverrides;
  metadata?: Record<string, unknown>;
}
```

## 🔄 Жизненный цикл сессии

### 1. Создание

```typescript
const sessionId = await store.resolve('user:alice');
```

**Что происходит:**
1. Проверка в индексе: `index.keys['user:alice']`
2. Если не найдено:
   - Генерация UUID для session ID
   - Создание метаданных
   - Регистрация в индексе
   - Создание директории сессии
3. Возврат session ID

### 2. Добавление сообщений

```typescript
const msg = await store.append(sessionId, {
  type: 'user',
  role: 'user',
  content: 'Hello',
  parentId: null
});
```

**Что происходит:**
1. Генерация ID и timestamp
2. Append в `messages.jsonl`
3. Обновление `messageCount` в метаданных
4. Debounced save индекса

### 3. Чтение

```typescript
const messages = await store.getMessages(sessionId);
```

**Что происходит:**
1. Чтение `messages.jsonl`
2. Парсинг каждой строки как JSON
3. Возврат массива объектов

### 4. Удаление

```typescript
await store.deleteSession(sessionId);
```

**Что происходит:**
1. Удаление из индекса (keys + sessions)
2. Удаление всех файлов в директории сессии
3. Save индекса

## 🎨 Паттерны использования

### Pattern 1: Linear Conversation

```typescript
// Простой линейный диалог
const q = await store.append(sid, { content: 'Q', parentId: null });
const a = await store.append(sid, { content: 'A', parentId: q.id });
const q2 = await store.append(sid, { content: 'Q2', parentId: a.id });
```

### Pattern 2: Branching Responses

```typescript
// Создание альтернативных ответов
const question = await store.append(sid, { content: 'Q', parentId: null });

const ans1 = await store.append(sid, { content: 'A1', parentId: question.id });
const ans2 = await store.append(sid, { content: 'A2', parentId: question.id });
const ans3 = await store.append(sid, { content: 'A3', parentId: question.id });

// Пользователь выбирает вариант
const followUp = await store.append(sid, { 
  content: 'Continue', 
  parentId: ans2.id  // Выбрали второй вариант
});
```

### Pattern 3: Multi-Root Sessions

```typescript
// Несколько независимых деревьев в одной сессии
const sys = await store.append(sid, { type: 'system', parentId: null });
const conv1 = await store.append(sid, { content: 'Conv 1', parentId: null });
const conv2 = await store.append(sid, { content: 'Conv 2', parentId: null });
```

## ⚡ Производительность

### Complexity Analysis

| Operation | Time | Space | Notes |
|-----------|------|-------|-------|
| append | O(1) | O(1) | Append to file |
| getMessages | O(n) | O(n) | Read all messages |
| getLinearHistory | O(n) | O(n) | Traverse tree up |
| getChildren | O(n) | O(k) | Filter by parentId |
| getTree | O(n) | O(m) | BFS/DFS traversal |
| acquireLock | O(1) | O(1) | Map lookup |
| resolve | O(1) | O(1) | Index lookup |

где:
- n = total messages
- k = children count
- m = subtree size

### Optimization Strategies

**1. Debounced Index Saves**
```typescript
// Вместо сохранения на каждое изменение:
await index.save();  // Debounced 100ms

// Force save:
await index.saveNow();
```

**2. Streaming для больших файлов**
```typescript
for await (const msg of jsonl.readStream()) {
  // Process one by one, не загружая все в память
  processMessage(msg);
}
```

**3. Lock Cleanup**
```typescript
// Периодическая очистка expired locks
setInterval(() => {
  lockManager.cleanup();
}, 60000);  // Every minute
```

## 🔒 Конкурентность

### Race Condition Prevention

**Сценарий:** 2 воркера пытаются писать в одну сессию

```typescript
// Worker 1
await store.withLock(sessionId, 'worker-1', async () => {
  await store.append(sessionId, message1);
});

// Worker 2 (ждет освобождения lock)
await store.withLock(sessionId, 'worker-2', async () => {
  await store.append(sessionId, message2);
});
```

**Гарантии:**
- Только один воркер может писать одновременно
- Автоматическое освобождение lock (даже при ошибке)
- Timeout защита от deadlocks

### Debounced Saves

Index saves are debounced для группировки:

```typescript
await store.append(sid, msg1);  // Schedule save in 100ms
await store.append(sid, msg2);  // Reset timer
await store.append(sid, msg3);  // Reset timer
// ... actual save happens 100ms after last append
```

## 🧪 Тестирование

### Test Coverage: 93.26%

**Стратегия тестирования:**

1. **Unit Tests** - каждый компонент отдельно
   - FileSystem (Real + InMemory)
   - JSONLFile
   - SessionIndex
   - LockManager
   - AutoReset
   
2. **Integration Tests** - взаимодействие компонентов
   - SessionStore + Locking
   - Persistence
   - Complex scenarios

3. **Edge Cases**
   - Concurrent access
   - Lock timeouts
   - Corrupted JSONL
   - Empty sessions

### Test Fixtures

```typescript
// Используем InMemoryFileSystem для быстрых тестов
const fs = new InMemoryFileSystem();
const store = new SessionStore(fs);
await store.init();

// Весь тест изолирован, нет side effects
```

## 🔮 Будущие улучшения

1. **Компактификация** - сжатие старых сессий
2. **Репликация** - синхронизация между nodes
3. **Индексация** - полнотекстовый поиск по сообщениям
4. **Версионирование** - schema migrations
5. **Сжатие** - gzip для старых messages.jsonl
6. **Batch operations** - оптимизация множественных append
7. **WebSocket sync** - real-time updates между клиентами
8. **Quota management** - лимиты на размер сессий

## 📚 Связь с другими модулями

### Integration с Message Bus

```typescript
// Session Store может эмитить события через Message Bus
bus.on('session.updated', async ({ sessionId }) => {
  // Реакция на обновление сессии
});

// Или использовать для координации воркеров
bus.on('session.lock.requested', async ({ sessionId, workerId }) => {
  const result = await store.acquireLock(sessionId, workerId);
  bus.emit('session.lock.result', { sessionId, result });
});
```

### Future Modules

- **Compaction Module** - автоматическое сжатие/суммаризация
- **Search Module** - индексация и поиск
- **Analytics Module** - статистика по сессиям
- **Sync Module** - синхронизация с облаком

## 🎯 Design Decisions

### Почему JSONL а не SQLite?

**За JSONL:**
- ✅ Простота реализации
- ✅ Human-readable
- ✅ Append-only = crash safe
- ✅ Легкая репликация (rsync, git)
- ✅ Streaming processing

**Против SQLite:**
- ❌ Сложнее реализация
- ❌ Binary format
- ❌ Нужна транзакционная логика
- ⚠️ Но быстрее для сложных запросов

**Вывод:** JSONL достаточно для большинства случаев. Для очень больших объемов можно добавить SQLite backend через FileSystem интерфейс.

### Почему In-Memory Index?

Держать индекс в памяти:
- ✅ Быстрый O(1) доступ к метаданным
- ✅ Нет disk I/O на каждый запрос
- ⚠️ Требует загрузки при старте

Альтернатива: каждый раз читать sessions.json
- ❌ Медленно
- ❌ Много disk I/O

### Почему UUID для Message ID?

UUID vs Sequential IDs:
- ✅ Глобально уникальные
- ✅ Можно генерировать offline
- ✅ Нет конфликтов при merge
- ❌ Длиннее (36 chars vs ~10)

## 📐 Принципы проектирования

1. **Single Responsibility** - каждый класс делает одно
2. **Dependency Injection** - FileSystem передается извне
3. **Fail-Safe** - graceful обработка ошибок
4. **Backwards Compatible** - легко добавить новые поля
5. **Testable** - InMemory версии для тестов
