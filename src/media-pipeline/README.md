# Media Pipeline

Система обработки медиафайлов для агента.

## Возможности

### Поддерживаемые типы медиа

#### Изображения
- **Форматы**: JPEG, PNG, GIF, WebP, HEIC
- **Размер**: до 20MB
- **Операции**: описание, OCR, определение объектов

#### Аудио
- **Форматы**: MP3, WAV, M4A, OGG, FLAC, WebM
- **Размер**: до 25MB
- **Длительность**: до 4 часов
- **Операции**: транскрипция, временные метки, определение языка

#### Видео
- **Форматы**: MP4, MOV, WebM, AVI
- **Размер**: до 100MB
- **Длительность**: до 10 минут
- **Операции**: описание, транскрипция аудио

#### Документы
- **Форматы**: PDF, DOCX, TXT, MD, HTML, CSV, XLSX
- **Размер**: до 50MB
- **Операции**: извлечение текста, таблиц, метаданных

## Архитектура

```
MediaPipeline
├── Detector     - определение типа медиа
├── Validator    - проверка размера и формата
├── Converter    - конвертация форматов
├── ProviderChain - цепочка провайдеров с fallback
├── Cache        - кэширование результатов
└── Providers    - провайдеры обработки
    ├── OpenAI (audio, vision)
    ├── Groq (audio)
    ├── Anthropic (vision)
    ├── CLI (local audio)
    └── Document (built-in)
```

## Использование

### Базовый пример

```typescript
import { MediaPipeline } from './media-pipeline';

const pipeline = new MediaPipeline({
  providers: {
    openai: { apiKey: process.env.OPENAI_API_KEY },
    groq: { apiKey: process.env.GROQ_API_KEY },
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
  },
});

// Обработать медиа
const result = await pipeline.process({
  type: 'buffer',
  data: buffer,
  filename: 'audio.mp3',
});

console.log(result.content); // Транскрипция
```

### Транскрипция аудио

```typescript
const result = await pipeline.transcribe({
  type: 'path',
  path: '/path/to/audio.mp3',
}, {
  language: 'ru',
  includeTimestamps: true,
});

console.log(result.data.transcript);
console.log(result.data.segments); // С временными метками
```

### Понимание изображений

```typescript
const result = await pipeline.describeImage({
  type: 'url',
  url: 'https://example.com/image.jpg',
}, {
  mode: 'full', // 'full' | 'summary' | 'ocr'
});

console.log(result.data.description);
console.log(result.data.ocrText); // Если есть текст
```

### Извлечение из документов

```typescript
const result = await pipeline.extractText({
  type: 'buffer',
  data: pdfBuffer,
  filename: 'document.pdf',
});

console.log(result.data.text);
console.log(result.data.pages);
console.log(result.data.tables);
```

## Конфигурация

```typescript
const config: MediaPipelineConfig = {
  // API ключи провайдеров
  providers: {
    openai: { apiKey: '...' },
    groq: { apiKey: '...' },
    anthropic: { apiKey: '...' },
  },
  
  // Приоритеты провайдеров
  priorities: {
    audio: ['openai', 'groq', 'cli'],
    image: ['openai', 'anthropic'],
    video: [],
    document: ['builtin'],
  },
  
  // Лимиты
  limits: {
    maxImageSize: 20 * 1024 * 1024,
    maxAudioSize: 25 * 1024 * 1024,
    maxVideoSize: 100 * 1024 * 1024,
    maxDocumentSize: 50 * 1024 * 1024,
    maxAudioDuration: 14400,  // 4 часа
    maxVideoDuration: 600,     // 10 минут
  },
  
  // Настройки обработки
  processing: {
    defaultLanguage: undefined,  // auto-detect
    imageMaxDimension: 4096,
    includeTimestamps: true,
    includeDiarization: false,
  },
  
  // Кэш
  cache: {
    enabled: true,
    maxSize: 500 * 1024 * 1024,  // 500MB
    ttl: 86400000,                // 24 часа
    persistent: false,
  },
  
  // CLI инструменты
  cli: {
    enabled: true,
    whisperPath: undefined,  // auto-detect
    ffmpegPath: undefined,   // auto-detect
  },
  
  // Таймауты
  timeouts: {
    upload: 60000,
    processing: 300000,
    total: 600000,
  },
};
```

## Provider Chain

Система автоматически пытается провайдеры по порядку:

```typescript
// Для аудио: OpenAI → Groq → CLI
const result = await pipeline.transcribe(audio);

// Если OpenAI недоступен, попробует Groq
// Если Groq failed, попробует локальный CLI
```

## Кэширование

Результаты кэшируются по:
- Content hash (первый 1MB + размер)
- Провайдер
- Опции обработки

```typescript
// Первый вызов - обработка
const result1 = await pipeline.process(input);
console.log(result1.metadata.cached); // false

// Второй вызов - из кэша
const result2 = await pipeline.process(input);
console.log(result2.metadata.cached); // true

// Очистить кэш
pipeline.clearCache();
```

## Progress Reporting

```typescript
const result = await pipeline.process(input, {
  onProgress: (progress) => {
    console.log(`${progress.stage}: ${progress.percent}%`);
    console.log(progress.message);
  },
});
```

## Валидация

```typescript
const validation = await pipeline.validate(input, 'audio');

if (!validation.valid) {
  console.error(validation.errors);
  // [{ code: 'TOO_LARGE', message: '...', limit: 25MB, actual: 30MB }]
}
```

## Определение типа

```typescript
const typeInfo = pipeline.detectType(input);

console.log(typeInfo.category); // 'audio'
console.log(typeInfo.format);   // 'mp3'
console.log(typeInfo.mimeType); // 'audio/mpeg'
console.log(typeInfo.confidence); // 0.95
```

## Обработка ошибок

```typescript
const result = await pipeline.process(input);

if (!result.success) {
  console.error(result.error?.code);
  console.error(result.error?.message);
  console.error(result.error?.retryable);
}
```

## Провайдеры

### OpenAI Whisper
- Транскрипция аудио
- Временные метки (word-level, segment-level)
- Автоопределение языка
- До 25MB

### Groq Whisper
- Быстрая транскрипция
- Совместим с OpenAI API
- whisper-large-v3 модель

### CLI (Local)
- Локальная обработка без API
- Поддержка whisper-cli, whisper.cpp, sherpa-onnx
- Fallback когда API недоступны

### OpenAI Vision
- Описание изображений
- OCR
- GPT-4 Vision

### Anthropic Claude Vision
- Описание изображений
- OCR
- Claude 3.5 Sonnet

### Document Extractor
- PDF: pdf-parse
- DOCX: mammoth
- XLSX: xlsx
- HTML: cheerio
- Встроенный, без API

## Зависимости

### Required
```json
{
  "form-data": "^4.0.0"
}
```

### Optional (для расширенных возможностей)
```json
{
  "sharp": "^0.33.0",           // Обработка изображений
  "heic-convert": "^2.1.0",     // HEIC → JPEG
  "pdf-parse": "^1.1.1",        // PDF extraction
  "mammoth": "^1.6.0",          // DOCX extraction
  "xlsx": "^0.18.5",            // Excel extraction
  "cheerio": "^1.0.0-rc.12"     // HTML parsing
}
```

### CLI Tools (optional, для fallback)
```bash
# Whisper CLI
pip install openai-whisper

# FFmpeg (для аудио/видео)
brew install ffmpeg

# ImageMagick (для изображений)
brew install imagemagick
```

## Тестирование

```bash
# Запустить все тесты
npm test src/media-pipeline

# Конкретный компонент
npm test src/media-pipeline/detector.test.ts
```

## Производительность

- **Кэш**: результаты кэшируются, повторная обработка мгновенная
- **Параллельная обработка**: можно обрабатывать несколько файлов параллельно
- **LRU eviction**: автоматическое управление памятью кэша
- **Retry logic**: автоматические повторы при временных ошибках

## Ограничения

- Размеры файлов зависят от провайдера
- API rate limits применяются
- Локальные CLI требуют установки инструментов
- Видео обработка требует Google Gemini (не реализовано в базовой версии)

## Roadmap

- [ ] Google Gemini для видео
- [ ] Deepgram для аудио
- [ ] Персистентный кэш
- [ ] Streaming для длинных медиа
- [ ] Batch processing
- [ ] Cost tracking
