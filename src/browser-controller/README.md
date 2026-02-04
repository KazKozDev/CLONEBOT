# Browser Controller

Система управления браузером через Chrome DevTools Protocol (CDP) для автоматизации веб-задач.

## Возможности

- 🌐 **Навигация** - переходы по URL, reload, history
- 🔍 **Сканирование элементов** - автоматическая идентификация и нумерация
- 🖱️ **Действия** - клики, ввод текста, заполнение форм
- 📸 **Скриншоты** - полностраничные и элементов, с аннотациями
- 📄 **PDF** - генерация PDF из страниц
- 🍪 **Управление состоянием** - cookies, localStorage
- 🎯 **Smart Element References** - элементы по номерам вместо селекторов
- 🔒 **Безопасность** - изоляция, allowlist/blocklist URL

## Быстрый старт

```typescript
import { BrowserController } from './browser-controller';

// Создать контроллер
const browser = new BrowserController({
  mode: 'openclaw',
  openclaw: {
    headless: true
  }
});

// Запустить браузер
await browser.launch();

// Навигация
await browser.navigate('https://example.com');

// Получить snapshot с элементами
const snapshot = await browser.snapshot();
console.log(`Found ${snapshot.elements.length} elements`);

// Взаимодействие с элементами по номерам
await browser.click(1); // Клик на элемент #1
await browser.fill(2, 'Hello World'); // Заполнить поле #2

// Скриншот
const screenshot = await browser.screenshot();

// Закрыть
await browser.close();
```

## Режимы работы

### OpenClaw (изолированный)

Запуск собственного Chromium процесса:

```typescript
const browser = new BrowserController({
  mode: 'openclaw',
  openclaw: {
    executablePath: '/path/to/chrome', // или auto-detect
    userDataDir: '~/.openclaw/browser-data',
    headless: true,
    args: ['--disable-gpu']
  }
});
```

### Chrome (подключение к существующему)

Подключение к запущенному Chrome:

```typescript
const browser = new BrowserController({
  mode: 'chrome',
  chrome: {
    debuggingPort: 9222
  }
});
```

Запустите Chrome с флагом:
```bash
google-chrome --remote-debugging-port=9222
```

### Remote (удалённый endpoint)

Подключение к Browserless, Selenium Grid и т.д.:

```typescript
const browser = new BrowserController({
  mode: 'remote',
  remote: {
    wsEndpoint: 'ws://localhost:3000',
    headers: {
      'Authorization': 'Bearer token'
    }
  }
});
```

## API

### Lifecycle

```typescript
await browser.launch()           // Запустить браузер
await browser.close()            // Закрыть браузер
browser.isConnected()            // Проверить соединение
browser.getInfo()                // Информация о браузере
```

### Navigation

```typescript
await browser.navigate(url, {
  waitUntil: 'load',             // 'load' | 'domcontentloaded' | 'networkidle'
  timeout: 30000,
  referer: 'https://...'
})

await browser.reload({ ignoreCache: true })
await browser.goBack()
await browser.goForward()
await browser.getCurrentUrl()
await browser.getTitle()
```

### Snapshots

```typescript
const snapshot = await browser.snapshot({
  includeScreenshot: true,
  maxElements: 100,
  annotateElements: true         // Рисовать номера на скриншоте
})

// snapshot = {
//   screenshot: 'base64...',
//   elements: [
//     { index: 1, tag: 'button', text: 'Submit', ... },
//     { index: 2, tag: 'input', placeholder: 'Email', ... }
//   ],
//   url: 'https://...',
//   title: 'Page Title',
//   timestamp: 1234567890
// }
```

### Actions

Используйте номера элементов из snapshot:

```typescript
// По номеру
await browser.click(1)
await browser.fill(2, 'text@example.com')
await browser.select(3, 'Option 1')

// По селектору
await browser.click('#submit-button')
await browser.fill('input[name="email"]', 'text@example.com')

// По координатам
await browser.click({ x: 100, y: 200 })

// Другие действия
await browser.hover(1)
await browser.pressKey('Enter')
await browser.scroll({ direction: 'down', amount: 500 })
await browser.upload('#file-input', ['/path/to/file.pdf'])
```

### Screenshots & PDF

```typescript
// Screenshot
const screenshot = await browser.screenshot({
  fullPage: true,
  format: 'png',
  quality: 90
})

// Element screenshot
const snapshot = await browser.snapshot()
const element = snapshot.elements[0]
const clip = {
  x: element.bounds.x,
  y: element.bounds.y,
  width: element.bounds.width,
  height: element.bounds.height
}
await browser.screenshot({ clip })

// PDF
const pdf = await browser.pdf({
  format: 'A4',
  landscape: false,
  printBackground: true
})
```

### JavaScript Execution

```typescript
// Evaluate expression
const title = await browser.evaluate('document.title')

// Evaluate function
const links = await browser.evaluate(() => {
  return Array.from(document.querySelectorAll('a'))
    .map(a => a.href)
})

// With arguments
const result = await browser.evaluate((x, y) => x + y, 10, 20)

// Get HTML
const html = await browser.getHTML('#main')
const text = await browser.getText('.content')
```

### Waiting

```typescript
// Wait for element
const element = await browser.waitForSelector('#dynamic-element', {
  visible: true,
  timeout: 10000
})

// Wait for navigation
await browser.click('a[href="/next"]')
const result = await browser.waitForNavigation({
  waitUntil: 'load'
})
```

### State Management

```typescript
// Cookies
const cookies = await browser.getCookies()
await browser.setCookie({
  name: 'session',
  value: 'abc123',
  domain: 'example.com'
})

// Clear data
await browser.clearData({
  cookies: true,
  cache: true,
  localStorage: true
})
```

### Events

```typescript
browser.on('navigated', (result) => {
  console.log('Navigated to:', result.url)
})

browser.on('error', (error) => {
  console.error('Browser error:', error)
})
```

## Element Identification

Система автоматически сканирует и нумерует интерактивные элементы:

```
┌─────────────────────────────┐
│  [1] Logo    [2] Search     │
│  [3] Nav1  [4] Nav2  [5]Nav3│
├─────────────────────────────┤
│  [6] Sidebar                │
│  [7] Link1                  │
│  [8] Link2     [9] Content  │
│  [10] Link3                 │
└─────────────────────────────┘
```

Элементы нумеруются слева направо, сверху вниз.

### Какие элементы сканируются

- Кнопки (`button`, `input[type=button]`, `[role=button]`)
- Ссылки (`a[href]`)
- Поля ввода (`input`, `textarea`, `select`)
- Интерактивные ARIA роли
- Элементы с `onclick`
- Видимые и доступные элементы

### Element Info

```typescript
{
  index: 1,                          // Номер для ссылки
  tag: 'button',                     // HTML тег
  role: 'button',                    // ARIA role
  name: 'Submit',                    // Accessible name
  text: 'Submit form',               // Видимый текст
  attributes: {
    id: 'submit-btn',
    class: 'btn btn-primary',
    type: 'submit'
  },
  bounds: {                          // Позиция на странице
    x: 100,
    y: 200,
    width: 120,
    height: 40
  },
  states: {
    visible: true,
    enabled: true,
    focused: false,
    checked: undefined
  },
  interactable: true                 // Можно взаимодействовать
}
```

## Конфигурация

```typescript
const browser = new BrowserController({
  mode: 'openclaw',
  
  viewport: {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 2,
    isMobile: false
  },
  
  timeouts: {
    navigation: 30000,
    action: 5000,
    idle: 500
  },
  
  security: {
    allowedURLPatterns: ['https://*.example.com/*'],
    blockedURLPatterns: ['*://ads.*/*'],
    downloadBehavior: 'deny',
    maxPages: 5
  },
  
  screenshots: {
    format: 'png',
    quality: 80,
    maxWidth: 1920,
    annotate: true
  },
  
  elements: {
    maxElements: 100,
    includeHidden: false,
    customSelectors: ['.my-interactive']
  }
})
```

## Архитектура

```
BrowserController (Facade)
├── CDPClient (WebSocket)
├── PageNavigator (Navigation)
├── ElementScanner (Element detection)
├── ActionExecutor (User actions)
└── ScreenshotHandler (Screenshots/PDF)
```

## Использование с Tool Executor

```typescript
// Регистрация browser tools
toolExecutor.registerTool({
  name: 'browser_navigate',
  description: 'Navigate to URL',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string' }
    }
  },
  execute: async ({ url }) => {
    return await browser.navigate(url)
  }
})

toolExecutor.registerTool({
  name: 'browser_snapshot',
  description: 'Get page snapshot with elements',
  execute: async () => {
    return await browser.snapshot()
  }
})

toolExecutor.registerTool({
  name: 'browser_click',
  description: 'Click element by index or selector',
  parameters: {
    type: 'object',
    properties: {
      target: { type: ['number', 'string'] }
    }
  },
  execute: async ({ target }) => {
    return await browser.click(target)
  }
})
```

## Edge Cases

### Navigation
- Редиректы
- Timeout при медленной загрузке
- 404 и HTTP ошибки
- JavaScript navigation (SPA)
- Download вместо навигации

### Elements
- Скрытые элементы (display: none)
- Элементы за viewport
- Элементы в iframe
- Динамически появляющиеся элементы
- Overlay закрывает элемент

### Screenshots
- Очень длинные страницы
- Position: fixed элементы
- Lazy-loaded изображения
- Canvas и WebGL

## Безопасность

```typescript
// URL allowlist
const browser = new BrowserController({
  security: {
    allowedURLPatterns: [
      'https://example.com/*',
      'https://*.trusted.com/*'
    ]
  }
})

// URL blocklist
const browser = new BrowserController({
  security: {
    blockedURLPatterns: [
      '*://ads.*/*',
      '*://*.analytics.com/*'
    ]
  }
})

// Download protection
const browser = new BrowserController({
  security: {
    downloadBehavior: 'deny'  // 'deny' | 'allow' | 'prompt'
  }
})
```

## Интеграция с Tool Executor

Browser Controller интегрирован с Tool Executor для использования в AI-агентах:

```typescript
import { ToolExecutor } from '../tool-executor';
import { registerBrowserTools } from '../tool-executor/browser-tools';

// Создать executor
const toolExecutor = new ToolExecutor();

// Зарегистрировать browser tools
const { cleanup } = registerBrowserTools(toolExecutor, {
  mode: 'chrome',
  headless: false
});

// Теперь доступны инструменты:
// - browser.navigate
// - browser.scan
// - browser.click
// - browser.type
// - browser.fill
// - browser.screenshot
// - browser.evaluate
// - browser.getCookies
// - browser.waitForNavigation

// Использование в агенте
const result = await toolExecutor.execute({
  name: 'browser.navigate',
  arguments: { url: 'https://example.com' }
});

// Не забыть закрыть
await cleanup();
```

## Интеграция с Agent Loop

Полный пример использования с Agent Loop:

```typescript
import { AgentLoop } from '../agent-loop';
import { ToolExecutor } from '../tool-executor';
import { registerBrowserTools } from '../tool-executor/browser-tools';

// Инициализация
const toolExecutor = new ToolExecutor();
const { cleanup } = registerBrowserTools(toolExecutor);

const agentLoop = new AgentLoop({
  modelAdapter,
  toolExecutor,
  contextAssembler,
  messageBus
});

// Агент теперь может использовать браузер
await agentLoop.processMessage({
  sessionId: 'session-1',
  input: 'Navigate to google.com and search for AI news',
  context: {}
});

// Cleanup
await cleanup();
```

См. полный пример в `agent-integration-example.ts`

## Тестирование

```bash
npm test                           # Все тесты
npm test cdp-client               # Конкретный компонент
npm test -- --coverage            # С покрытием
npm run checkpoint:browser        # Интеграционный тест
```

## Зависимости

- `ws` - WebSocket client для CDP
- Chrome/Chromium - браузер

Опциональные:
- `sharp` - обработка изображений для аннотаций
- `playwright` - для сложных действий

## Лицензия

MIT
