# Message Bus Module

Центральная шина событий для межмодульной коммуникации в системе CLONEBOT.

## Оглавление

- [Обзор](#обзор)
- [Установка](#установка)
- [Быстрый старт](#быстрый-старт)
- [API Reference](#api-reference)
- [Продвинутое использование](#продвинутое-использование)
- [Примеры](#примеры)
- [Лучшие практики](#лучшие-практики)

## Обзор

Message Bus — это событийно-ориентированная система коммуникации с поддержкой:

- ✅ **Pub/Sub паттерн** с типизированными событиями
- ✅ **Wildcard подписки** (tool.*, session.*, *)
- ✅ **Middleware pipeline** для трансформации и логирования
- ✅ **Приоритеты обработчиков**
- ✅ **Асинхронная обработка**
- ✅ **Продвинутая обработка ошибок**
- ✅ **TypeScript generics** для type safety

## Установка

```bash
npm install
```

## Быстрый старт

### Базовое использование

```typescript
import { MessageBus } from './message-bus';

// Создать инстанс
const bus = new MessageBus();

// Подписаться на событие
bus.on('user.login', (payload) => {
  console.log('User logged in:', payload.userId);
});

// Отправить событие
await bus.emit('user.login', { userId: '123' });
```

### Type-safe события

```typescript
import { MessageBus, EventPayloadMap } from './message-bus';

// Расширить типы событий
declare module './message-bus/types' {
  interface EventPayloadMap {
    'session.created': { sessionId: string; sessionKey: string };
    'tool.before': { toolName: string; params: unknown; runId: string };
    'model.delta': { runId: string; delta: string };
  }
}

const bus = new MessageBus<EventPayloadMap>();

// Теперь payload типизирован
bus.on('session.created', (payload) => {
  // TypeScript знает что payload имеет sessionId и sessionKey
  console.log(payload.sessionId, payload.sessionKey);
});

// TypeScript проверит правильность payload
await bus.emit('session.created', {
  sessionId: 'abc',
  sessionKey: 'xyz'
});
```

## API Reference

### Методы подписки

#### `on(event, handler, options?)`

Подписаться на событие.

```typescript
const unsubscribe = bus.on('event.name', (payload) => {
  console.log(payload);
}, { priority: 100, once: false });

// Отписаться
unsubscribe();
```

**Параметры:**
- `event`: строка или wildcard паттерн
- `handler`: функция `(payload) => void | Promise<void>`
- `options`: опциональный объект
  - `priority`: число (больше = раньше вызывается), по умолчанию 0
  - `once`: boolean, автоматически отписаться после первого срабатывания

**Возвращает:** функцию для отписки

#### `off(event, handler)`

Отписаться от события.

```typescript
const handler = (payload) => console.log(payload);
bus.on('event.name', handler);
bus.off('event.name', handler);
```

#### `once(event, handler, options?)`

Подписаться на событие один раз (сахар для `on` с `once: true`).

```typescript
bus.once('session.created', (payload) => {
  console.log('Session created once:', payload);
});
```

### Методы отправки

#### `emit(event, payload)`

Асинхронная отправка события. Ждёт выполнения всех обработчиков.

```typescript
await bus.emit('user.action', { action: 'click', target: 'button' });
```

**Возвращает:** `Promise<void>`

#### `emitSync(event, payload)`

Синхронная отправка события. Не ждёт async обработчиков.

```typescript
bus.emitSync('user.action', { action: 'click' });
```

### Middleware

#### `use(middleware)`

Добавить middleware в pipeline.

```typescript
bus.use(async (event, payload, next) => {
  console.log('Before:', event);
  await next(); // Вызвать следующий middleware или обработчики
  console.log('After:', event);
});
```

**Middleware может:**
- Логировать события
- Трансформировать payload
- Фильтровать события (не вызывая `next`)
- Измерять время выполнения

### Обработка ошибок

#### `onError(handler)`

Установить глобальный обработчик ошибок.

```typescript
bus.onError((error, event, payload) => {
  console.error(`Error in ${event}:`, error);
  // Отправить в систему мониторинга
  monitoring.logError(error, { event, payload });
});
```

### Утилиты

#### `listenerCount(event)`

Получить количество подписчиков на событие.

```typescript
const count = bus.listenerCount('user.login');
```

#### `eventNames()`

Получить список всех событий с подписчиками.

```typescript
const events = bus.eventNames();
// ['user.login', 'user.logout', 'tool.*', ...]
```

#### `removeAllListeners(event?)`

Удалить всех подписчиков (осторожно! используйте только для тестов).

```typescript
bus.removeAllListeners('user.login'); // Удалить подписчиков с конкретного события
bus.removeAllListeners(); // Удалить всех подписчиков со всех событий
```

## Продвинутое использование

### Wildcard подписки

```typescript
// Подписаться на все события с префиксом "tool"
bus.on('tool.*', (payload) => {
  console.log('Tool event:', payload);
});

// Срабатывает для:
await bus.emit('tool.before', {});
await bus.emit('tool.after', {});
await bus.emit('tool.error', {});

// НЕ срабатывает для:
await bus.emit('tool.exec.start', {}); // Вложенное событие
await bus.emit('session.created', {}); // Другой префикс

// Подписаться на ВСЕ события
bus.on('*', (payload) => {
  console.log('Any event:', payload);
});
```

### Приоритеты

```typescript
// Высокий приоритет = вызывается раньше
bus.on('request', validateRequest, { priority: 100 });
bus.on('request', logRequest, { priority: 50 });
bus.on('request', processRequest, { priority: 0 });

// Порядок выполнения: validate -> log -> process
```

### Middleware для логирования

```typescript
// Логировать все события
bus.use(async (event, payload, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Event: ${event}`, payload);
  await next();
});
```

### Middleware для фильтрации

```typescript
// Блокировать события в зависимости от условий
bus.use(async (event, payload, next) => {
  // Проверка прав доступа
  if (payload.user && payload.user.role === 'admin') {
    await next(); // Разрешить
  } else {
    console.log('Access denied for event:', event);
    // Не вызываем next() - событие заблокировано
  }
});
```

### Middleware для трансформации

```typescript
// Добавить метаданные к каждому событию
bus.use(async (event, payload, next) => {
  payload._timestamp = Date.now();
  payload._eventId = generateId();
  await next();
});
```

### Измерение производительности

```typescript
bus.use(async (event, payload, next) => {
  const start = performance.now();
  await next();
  const duration = performance.now() - start;
  
  if (duration > 100) {
    console.warn(`Slow event ${event}: ${duration}ms`);
  }
});
```

## Примеры

### Пример 1: Система сессий

```typescript
// Определить типы событий
declare module './message-bus/types' {
  interface EventPayloadMap {
    'session.created': { sessionId: string; userId: string };
    'session.closed': { sessionId: string; reason: string };
    'session.message': { sessionId: string; message: string };
  }
}

const bus = new MessageBus<EventPayloadMap>();

// Session Manager
class SessionManager {
  constructor(private bus: MessageBus) {
    this.bus.on('session.created', this.onSessionCreated);
    this.bus.on('session.closed', this.onSessionClosed);
  }

  async createSession(userId: string) {
    const sessionId = generateId();
    await this.bus.emit('session.created', { sessionId, userId });
    return sessionId;
  }

  private onSessionCreated = (payload) => {
    console.log('Session created:', payload.sessionId);
  };

  private onSessionClosed = (payload) => {
    console.log('Session closed:', payload.sessionId, payload.reason);
  };
}

// Logger Module
class Logger {
  constructor(private bus: MessageBus) {
    // Логировать все события сессий
    this.bus.on('session.*', this.logSessionEvent);
  }

  private logSessionEvent = (payload) => {
    console.log('[SESSION]', payload);
  };
}
```

### Пример 2: Tool execution pipeline

```typescript
declare module './message-bus/types' {
  interface EventPayloadMap {
    'tool.before': { toolName: string; params: unknown; runId: string };
    'tool.after': { toolName: string; result: unknown; runId: string };
    'tool.error': { toolName: string; error: Error; runId: string };
  }
}

const bus = new MessageBus<EventPayloadMap>();

// Security middleware
bus.use(async (event, payload, next) => {
  if (event.startsWith('tool.')) {
    if (!isAuthorized(payload)) {
      throw new Error('Unauthorized tool execution');
    }
  }
  await next();
});

// Tool executor
class ToolExecutor {
  async execute(toolName: string, params: unknown) {
    const runId = generateId();
    
    try {
      await bus.emit('tool.before', { toolName, params, runId });
      
      const result = await this.runTool(toolName, params);
      
      await bus.emit('tool.after', { toolName, result, runId });
      
      return result;
    } catch (error) {
      await bus.emit('tool.error', { toolName, error, runId });
      throw error;
    }
  }
  
  private async runTool(name: string, params: unknown) {
    // Implementation
  }
}

// Monitoring
bus.on('tool.*', (payload) => {
  // Track all tool events
  metrics.track('tool.event', payload);
});

bus.on('tool.error', (payload) => {
  // Alert on errors
  alerts.send('Tool error', payload);
});
```

### Пример 3: Multiple module coordination

```typescript
const bus = new MessageBus();

// Analytics module
class Analytics {
  constructor(bus: MessageBus) {
    bus.on('*', this.trackEvent);
  }
  
  private trackEvent = (payload) => {
    // Send to analytics service
  };
}

// Notification module
class Notifications {
  constructor(bus: MessageBus) {
    bus.on('user.login', this.notifyLogin);
    bus.on('tool.error', this.notifyError);
  }
  
  private notifyLogin = (payload) => {
    this.sendNotification('User logged in', payload);
  };
  
  private notifyError = (payload) => {
    this.sendNotification('Tool error', payload);
  };
  
  private sendNotification(title: string, data: any) {
    // Implementation
  }
}

// Audit module
class Audit {
  constructor(bus: MessageBus) {
    bus.on('*', this.auditEvent, { priority: 200 }); // High priority
  }
  
  private auditEvent = (payload) => {
    this.log(payload);
  };
  
  private log(data: any) {
    // Save to audit log
  }
}

// Initialize system
const analytics = new Analytics(bus);
const notifications = new Notifications(bus);
const audit = new Audit(bus);
```

## Лучшие практики

### 1. Именование событий

Используйте иерархическую схему именования:

```typescript
// ✅ Хорошо
'session.created'
'session.message.sent'
'tool.before'
'model.delta'

// ❌ Плохо
'sessionCreated'
'TOOL_BEFORE'
'msg'
```

### 2. Type Safety

Всегда расширяйте `EventPayloadMap` для type-safe событий:

```typescript
// ✅ Хорошо
declare module './message-bus/types' {
  interface EventPayloadMap {
    'my.event': { id: string; data: number };
  }
}

// ❌ Плохо - нет type safety
bus.emit('my.event', { anything: 'goes' });
```

### 3. Обработка ошибок

Всегда устанавливайте глобальный обработчик ошибок:

```typescript
// ✅ Хорошо
bus.onError((error, event, payload) => {
  logger.error('Event handler error', { error, event, payload });
});

// ❌ Плохо - ошибки будут в console.error
```

### 4. Cleanup

Всегда отписывайтесь при уничтожении модулей:

```typescript
// ✅ Хорошо
class MyModule {
  private unsubscribers: (() => void)[] = [];
  
  constructor(bus: MessageBus) {
    this.unsubscribers.push(
      bus.on('event.one', this.handler1)
    );
    this.unsubscribers.push(
      bus.on('event.two', this.handler2)
    );
  }
  
  destroy() {
    this.unsubscribers.forEach(unsub => unsub());
  }
}
```

### 5. Избегайте циклических зависимостей

```typescript
// ❌ Плохо - бесконечная рекурсия
bus.on('event.a', async () => {
  await bus.emit('event.b', {});
});

bus.on('event.b', async () => {
  await bus.emit('event.a', {}); // Цикл!
});

// ✅ Хорошо - добавьте защиту
bus.on('event.a', async (payload) => {
  if (!payload._processed) {
    await bus.emit('event.b', { ...payload, _processed: true });
  }
});
```

### 6. Используйте приоритеты осознанно

```typescript
// ✅ Хорошо - security первым
bus.on('api.request', securityCheck, { priority: 100 });
bus.on('api.request', rateLimiter, { priority: 90 });
bus.on('api.request', logger, { priority: 50 });
bus.on('api.request', handler, { priority: 0 });
```

### 7. Тестирование

```typescript
describe('MyModule', () => {
  let bus: MessageBus;
  let module: MyModule;
  
  beforeEach(() => {
    bus = new MessageBus();
    module = new MyModule(bus);
  });
  
  afterEach(() => {
    bus.removeAllListeners(); // Очистка после тестов
  });
  
  it('should handle event', async () => {
    const handler = jest.fn();
    bus.on('my.event', handler);
    
    await bus.emit('my.event', { data: 'test' });
    
    expect(handler).toHaveBeenCalledWith({ data: 'test' });
  });
});
```

## Производительность

- **1000+ подписчиков**: оптимизировано для большого количества подписчиков
- **Wildcard matching**: эффективный алгоритм сопоставления паттернов
- **Async handlers**: параллельное выполнение для максимальной производительности
- **Memory**: автоматическая очистка once-подписчиков

## Лицензия

MIT
