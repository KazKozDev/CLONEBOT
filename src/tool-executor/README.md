# Tool Executor Module

Система регистрации, валидации и выполнения tools для AI-агентов. Tool — это функция, которую агент может вызвать для взаимодействия с внешним миром: файлы, браузер, API, shell и т.д.

## Возможности

- ✅ **Регистрация Tools** — централизованный каталог с валидацией определений
- ✅ **JSON Schema Validation** — полная валидация параметров с type coercion
- ✅ **Execution Control** — timeout, cancellation через AbortSignal
- ✅ **Hook System** — before/after/error hooks для расширения
- ✅ **Permission Management** — гранулярный контроль доступа с wildcards
- ✅ **Result Compression** — умное сжатие больших результатов (JSON/code/logs)
- ✅ **Concurrent Execution** — параллельное выполнение с лимитами
- ✅ **Nested Invocation** — tools могут вызывать другие tools
- ✅ **Statistics & Introspection** — отслеживание использования и производительности
- ✅ **Sandbox Mode** — ограничение опасных операций

## Установка

```typescript
import { ToolExecutor } from './tool-executor';

const executor = new ToolExecutor({
  defaultTimeout: 30000,
  maxTimeout: 600000,
  maxConcurrent: 10,
  maxResultLength: 50000,
  truncationStrategy: 'smart'
});
```

## Быстрый старт

### 1. Регистрация Tool

```typescript
import type { ToolDefinition, ToolHandler } from './tool-executor';

// Определение tool
const definition: ToolDefinition = {
  name: 'read_file',
  description: 'Read contents of a file',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file'
      },
      encoding: {
        type: 'string',
        enum: ['utf8', 'base64'],
        default: 'utf8'
      }
    },
    required: ['path']
  },
  metadata: {
    category: 'filesystem',
    permissions: ['fs.read'],
    timeout: 5000
  }
};

// Handler
const handler: ToolHandler = async (params, context) => {
  const { path, encoding } = params;
  
  try {
    const content = await fs.readFile(path as string, encoding as BufferEncoding);
    return {
      content: content.toString(),
      success: true
    };
  } catch (error) {
    return {
      content: `Error reading file: ${error.message}`,
      success: false,
      error: {
        code: 'FILE_READ_ERROR',
        message: error.message
      }
    };
  }
};

// Регистрация
executor.register(definition, handler);
```

### 2. Выполнение Tool

```typescript
// Создание контекста
const context = executor.createContext({
  sessionId: 'session-123',
  runId: 'run-456',
  toolCallId: 'call-1',
  permissions: ['fs.read', 'fs.write']
});

// Выполнение
const result = await executor.execute('read_file', {
  path: './data.txt',
  encoding: 'utf8'
}, context);

if (result.success) {
  console.log('File content:', result.content);
} else {
  console.error('Error:', result.error?.message);
}
```

### 3. Валидация параметров

```typescript
const validation = executor.validate('read_file', {
  path: './file.txt',
  encoding: 'invalid'  // Не в enum
});

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
}
```

## Основные концепции

### Tool Definition

Описание tool для модели и системы:

```typescript
interface ToolDefinition {
  name: string;                    // Уникальное имя
  description: string;             // Описание для модели
  parameters: JSONSchema;          // Схема параметров
  returns?: {                      // Описание результата
    description: string;
    schema?: JSONSchema;
  };
  metadata?: {
    category?: string;             // filesystem, system, browser, etc.
    permissions?: string[];        // Требуемые permissions
    timeout?: number;              // Timeout в ms
    dangerous?: boolean;           // Требует подтверждения
    cacheable?: boolean;           // Можно кэшировать
  };
  examples?: {                     // Примеры для модели
    input: Record<string, unknown>;
    output: string;
  }[];
}
```

### Execution Context

Окружение выполнения tool:

```typescript
interface ExecutionContext {
  sessionId: string;               // ID сессии
  runId: string;                   // ID запуска агента
  toolCallId: string;              // ID вызова tool
  
  permissions: Set<string>;        // Доступные permissions
  sandboxMode: boolean;            // Режим sandbox
  
  workingDirectory: string;        // Рабочая директория
  env: Record<string, string>;     // Environment variables
  
  signal: AbortSignal;             // Для отмены
  timeout: number;                 // Оставшееся время
  
  log: (level, message, data?) => void;
  emitProgress: (progress, message?) => void;
  invokeTool: (name, params) => Promise<ToolResult>;
}
```

### Tool Result

```typescript
interface ToolResult {
  content: string;                 // Текстовое представление
  data?: unknown;                  // Структурированные данные
  success: boolean;                // Успешность выполнения
  error?: {                        // Ошибка (если success: false)
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    duration?: number;             // Время выполнения
    truncated?: boolean;           // Результат обрезан
    originalLength?: number;       // Исходный размер
  };
}
```

## Продвинутые возможности

### Hooks

Расширение функциональности через hooks:

```typescript
import type { BeforeHook, AfterHook } from './tool-executor';

// Before hook — проверка перед выполнением
const authHook: BeforeHook = {
  name: 'auth_check',
  priority: 100,
  handler: async (context) => {
    const isAuthorized = await checkAuth(context.executionContext.sessionId);
    
    if (!isAuthorized) {
      return {
        proceed: false,
        reason: 'Not authorized'
      };
    }
    
    return { proceed: true };
  }
};

executor.addBeforeHook(authHook);

// After hook — логирование результата
const loggingHook: AfterHook = {
  name: 'result_logger',
  priority: 10,
  handler: async (context) => {
    await logToDatabase({
      tool: context.toolName,
      duration: context.duration,
      success: context.result.success
    });
    
    return context.result;
  }
};

executor.addAfterHook(loggingHook);
```

### Permissions

Гранулярный контроль доступа:

```typescript
// Регистрация tool с permissions
executor.register({
  name: 'delete_file',
  description: 'Delete a file',
  parameters: { /* ... */ },
  metadata: {
    permissions: ['fs.delete'],
    dangerous: true
  }
}, handler);

// Создание контекста с permissions
const context = executor.createContext({
  sessionId: 'session-123',
  runId: 'run-456',
  toolCallId: 'call-1',
  permissions: ['fs.*']  // Wildcard — все fs.* permissions
});

// Выполнение — permission check автоматический
const result = await executor.execute('delete_file', { path: './file.txt' }, context);
```

**Стандартные permissions:**
- `fs.read`, `fs.write`, `fs.delete`
- `process.exec`, `process.kill`
- `network.http`, `network.ws`
- `browser.navigate`, `browser.interact`, `browser.screenshot`
- `session.read`, `session.write`
- `system.env`, `system.dangerous`

### Concurrent Execution

Параллельное выполнение нескольких tools:

```typescript
const calls = [
  { id: 'call-1', name: 'read_file', params: { path: './file1.txt' } },
  { id: 'call-2', name: 'read_file', params: { path: './file2.txt' } },
  { id: 'call-3', name: 'read_file', params: { path: './file3.txt' } }
];

const results = await executor.executeMany(calls, context);

for (const [id, result] of results) {
  console.log(`${id}: ${result.success ? 'OK' : 'Error'}`);
}
```

### Nested Tool Invocation

Tool может вызывать другие tools:

```typescript
executor.register({
  name: 'analyze_code',
  description: 'Analyze code in a file',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' }
    },
    required: ['path']
  }
}, async (params, context) => {
  // Сначала читаем файл
  const fileResult = await context.invokeTool('read_file', {
    path: params.path
  });
  
  if (!fileResult.success) {
    return fileResult;
  }
  
  // Затем анализируем
  const code = fileResult.content;
  const analysis = performAnalysis(code);
  
  return {
    content: JSON.stringify(analysis, null, 2),
    data: analysis,
    success: true
  };
});
```

### Result Compression

Автоматическое сжатие больших результатов:

```typescript
const executor = new ToolExecutor({
  maxResultLength: 10000,
  truncationStrategy: 'smart'  // 'end', 'middle', 'smart'
});

// Smart стратегия:
// - JSON: сокращает длинные строки и массивы, сохраняет структуру
// - Code: сохраняет начало и конец функций
// - Logs: первые и последние строки
```

### Sandbox Mode

Ограничение опасных операций:

```typescript
const executor = new ToolExecutor({
  sandboxMode: true,
  sandboxAllowlist: ['read_file', 'list_dir'],
  sandboxDenylist: ['bash', 'delete_file']
});

// В sandbox mode только безопасные tools доступны
const tools = executor.getForModel({ sandboxMode: true });
// Вернёт только read_file и list_dir
```

## Discovery & Introspection

### Поиск tools

```typescript
// Все tools
const all = executor.list();

// По категории
const fsTools = executor.list({ category: 'filesystem' });

// По permissions
const readTools = executor.list({ permissions: ['fs.read'] });

// Поиск по имени/описанию
const fileTools = executor.list({ search: 'file' });

// Для модели (исключает dangerous)
const modelTools = executor.getForModel();
```

### Статистика

```typescript
// Информация о конкретном tool
const info = executor.introspect('read_file');
console.log('Executions:', info.executionCount);
console.log('Avg duration:', info.averageDuration);

// Общая статистика
const stats = executor.getStats();
console.log('Total tools:', stats.totalTools);
console.log('Total executions:', stats.totalExecutions);
console.log('Most used:', stats.mostUsed);
console.log('Recent errors:', stats.recentErrors);
```

## Примеры Tool Definitions

### Файловая система

```typescript
// read_file
{
  name: 'read_file',
  description: 'Read contents of a file',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to file' },
      encoding: { type: 'string', enum: ['utf8', 'base64'], default: 'utf8' }
    },
    required: ['path']
  },
  metadata: {
    category: 'filesystem',
    permissions: ['fs.read'],
    timeout: 5000
  }
}

// write_file
{
  name: 'write_file',
  description: 'Write content to a file',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' },
      append: { type: 'boolean', default: false }
    },
    required: ['path', 'content']
  },
  metadata: {
    category: 'filesystem',
    permissions: ['fs.write'],
    dangerous: true,
    timeout: 10000
  }
}
```

### Системные операции

```typescript
// bash
{
  name: 'bash',
  description: 'Execute bash command',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command to execute' },
      cwd: { type: 'string', description: 'Working directory' },
      timeout: { type: 'integer', minimum: 1000, maximum: 300000, default: 30000 }
    },
    required: ['command']
  },
  metadata: {
    category: 'system',
    permissions: ['process.exec'],
    dangerous: true,
    timeout: 30000
  }
}
```

### Браузер

```typescript
// browser.click
{
  name: 'browser.click',
  description: 'Click element in browser',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector' },
      button: { type: 'string', enum: ['left', 'right', 'middle'], default: 'left' }
    },
    required: ['selector']
  },
  metadata: {
    category: 'browser',
    permissions: ['browser.interact'],
    timeout: 10000
  }
}
```

## Тестирование

```bash
npm test -- tool-executor
```

**Покрытие:**
- 37 тестов
- Регистрация и валидация
- Execution с timeout/cancellation
- Hooks (before/after/error)
- Permissions и sandbox
- Concurrent execution
- Nested invocation

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                     ToolExecutor                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Registry   │  │ HookManager  │  │   Executor   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Validation  │ │  Permissions │ │ Compression  │
└──────────────┘ └──────────────┘ └──────────────┘
```

## Лицензия

MIT
