# Model Adapter Layer

Унифицированный интерфейс для работы с 5 провайдерами AI моделей.

## Возможности

- **5 провайдеров**: Anthropic (Claude), OpenAI (GPT), Google (Gemini), Ollama, llama.cpp
- **12 моделей**: От Claude Opus до локальных моделей
- **Стриминг**: Унифицированный Delta тип для всех провайдеров
- **Инструменты**: Tool use с автоматической конверсией форматов
- **Thinking**: Расширенное мышление Anthropic
- **Retry & Fallback**: Автоматические повторы и цепочки резервных моделей
- **Tracking**: Отслеживание использования токенов и затрат

## Быстрый старт

```typescript
import { createModelAdapter } from './model-adapter';

// Создать адаптер
const adapter = await createModelAdapter();

// Сгенерировать ответ
for await (const delta of adapter.complete({
  model: 'opus',  // или 'anthropic/claude-opus-4-5-20251124'
  messages: [
    { role: 'user', content: 'Объясни квантовую запутанность' }
  ],
})) {
  if (delta.type === 'text') {
    process.stdout.write(delta.text);
  }
}
```

## Поддерживаемые модели

### Anthropic (Claude)
- **opus** (claude-opus-4-5-20251124) - Наивысшее качество, 200K контекст
- **sonnet** (claude-sonnet-4-5-20251124) - Баланс качества/цены
- **haiku** (claude-haiku-4-5-20251124) - Быстрый и дешевый

### OpenAI (GPT)
- **gpt5-instant** - Instant версия
- **gpt5-2** - GPT-5-2
- **gpt5** - Стандартный GPT-5
- **gpt5-mini** - Компактный
- **gpt5-nano** - Самый маленький

### Google (Gemini)
- **gemini-3** - 1M контекст
- **gemini-flash** - Быстрая версия

### Локальные
- **llama3.3:70b** (Ollama)
- **local** (llama.cpp)

## Примеры использования

### Базовое использование

```typescript
const adapter = await createModelAdapter();

// Простой запрос
for await (const delta of adapter.complete({
  model: 'sonnet',
  messages: [
    { role: 'user', content: 'Привет!' }
  ],
})) {
  console.log(delta);
}
```

### Использование инструментов

```typescript
for await (const delta of adapter.complete({
  model: 'opus',
  messages: [
    { role: 'user', content: 'Найди информацию о TypeScript' }
  ],
  tools: [
    {
      name: 'search',
      description: 'Поиск в интернете',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' }
        }
      }
    }
  ],
})) {
  if (delta.type === 'tool_use_start') {
    console.log(`Calling tool: ${delta.name}`);
  }
}
```

### Thinking (Anthropic)

```typescript
for await (const delta of adapter.complete({
  model: 'opus',
  messages: [
    { role: 'user', content: 'Реши сложную задачу...' }
  ],
  thinkingLevel: 'high',
  thinkingBudget: 10000,
})) {
  if (delta.type === 'thinking') {
    console.log(`[Thinking] ${delta.text}`);
  }
}
```

### Fallback Chain

```typescript
import { createFallbackChain, createCloudToLocalFallback } from './model-adapter';

const fallback = createFallbackChain(
  model => adapter.getProvider(model),
  {
    models: ['opus', 'sonnet', 'gpt5', 'ollama/llama3.3:70b'],
    onFallback: (failed, error, next) => {
      console.log(`${failed} failed, trying ${next}...`);
    }
  }
);

for await (const delta of fallback.complete(request)) {
  // Попробует модели по очереди до первого успеха
}
```

### Retry

```typescript
import { withRetry } from './model-adapter';

const provider = adapter.getProvider('anthropic')!;
const retryProvider = withRetry(provider, {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
});
```

## Конфигурация

### Через переменные окружения

```bash
ANTHROPIC_API_KEY=sk-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
OLLAMA_BASE_URL=http://localhost:11434
LLAMACPP_BASE_URL=http://localhost:8080
```

### Программно

```typescript
const adapter = new ModelAdapter();
await adapter.initialize({
  programmatic: {
    anthropic: { apiKey: 'sk-...' },
    openai: { apiKey: 'sk-...', organization: 'org-...' },
  }
});
```

### Через файл

```json
{
  "credentials": {
    "anthropic": {
      "apiKey": "sk-..."
    },
    "openai": {
      "apiKey": "sk-...",
      "organization": "org-..."
    }
  }
}
```

```typescript
await adapter.initialize({
  configFile: './config.json'
});
```

## Статистика

```typescript
// Получить статистику
const stats = adapter.getStats();

console.log(`Total requests: ${stats.totalRequests}`);
console.log(`Total cost: $${stats.totalCost.toFixed(4)}`);
console.log(`Success rate: ${(stats.successfulRequests / stats.totalRequests * 100).toFixed(1)}%`);

// По провайдеру
const anthropicStats = stats.byProvider['anthropic'];
console.log(`Anthropic cost: $${anthropicStats.cost.toFixed(4)}`);

// По модели
const opusStats = stats.byModel['anthropic/claude-opus-4-5-20251124'];
console.log(`Opus requests: ${opusStats.requests}`);
```

## Типы Delta

Все провайдеры возвращают унифицированный тип `Delta`:

```typescript
type Delta =
  | TextDelta         // { type: 'text', text: string }
  | ToolUseStartDelta // { type: 'tool_use_start', id, name }
  | ToolUseDelta      // { type: 'tool_use_delta', id, input }
  | ToolUseEndDelta   // { type: 'tool_use_end', id }
  | ThinkingDelta     // { type: 'thinking', text }
  | DoneDelta         // { type: 'done', usage, stopReason }
  | ErrorDelta;       // { type: 'error', error }
```

## Архитектура

```
ModelAdapter
├── CredentialManager (управление API ключами)
├── Model Resolution (opus → anthropic/claude-opus-4-5-20251124)
├── Model Registry (метаданные 12 моделей)
├── UsageTracker (статистика и затраты)
└── Providers
    ├── AnthropicAdapter (SSE, tools, thinking)
    ├── OpenAIAdapter (SSE, tools, JSON mode)
    ├── GoogleAdapter (NDJSON, grounding)
    ├── OllamaAdapter (NDJSON, local)
    └── LlamaCppAdapter (OpenAI-compatible, local)
```

## Middleware

- **RetryAdapter**: Экспоненциальная задержка, jitter, конфигурируемые коды ошибок
- **FallbackAdapter**: Цепочки резервных моделей с оповещениями

## Health Checks

```typescript
const results = await adapter.healthCheck();

for (const { provider, healthy, latencyMs } of results) {
  console.log(`${provider}: ${healthy ? '✓' : '✗'} (${latencyMs}ms)`);
}
```

## Тестирование

Mock Provider для юнит-тестов:

```typescript
import { createMockProvider } from './model-adapter';

const mock = createMockProvider({
  mode: 'success',
  text: 'Test response',
});

// Или ошибка
mock.setBehavior({
  mode: 'error',
  error: { code: 'TEST_ERROR', message: 'Test' }
});

// Или chunked
mock.setBehavior({
  mode: 'chunked',
  text: 'Long response',
  chunks: 5
});
```

## Roadmap

- [x] Базовая реализация 5 провайдеров
- [x] Retry & Fallback
- [x] Usage tracking
- [x] Mock Provider
- [ ] Caching responses
- [ ] Rate limiting
- [ ] Provider health monitoring
- [ ] Advanced retry strategies
- [ ] More comprehensive tests

## Лицензия

MIT
