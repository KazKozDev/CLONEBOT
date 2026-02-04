# Telegram Channel Adapter

Bidirectional bridge between Telegram and OpenClaw agent system.

## Features

- ✅ **Dual Update Modes**: Long polling and webhook support
- ✅ **Message Streaming**: Real-time response editing for smooth UX
- ✅ **Rich Formatting**: Markdown, HTML, and code blocks
- ✅ **Media Support**: Photos, documents, audio, video, voice messages
- ✅ **Rate Limiting**: Automatic throttling to respect Telegram limits
- ✅ **DM Policy**: Pairing codes, allowlist, open, or disabled modes
- ✅ **Commands**: Built-in command system with custom handlers
- ✅ **Inline Keyboards**: Interactive buttons and callbacks
- ✅ **Typing Indicators**: "typing..." feedback during processing
- ✅ **Error Handling**: Graceful recovery and user notifications

## Quick Start

```typescript
import { TelegramAdapter } from './telegram-adapter';

const adapter = new TelegramAdapter({
  token: 'YOUR_BOT_TOKEN',
  mode: 'polling',
  dmPolicy: 'pairing',
});

// Listen for messages
adapter.on('message', async (message) => {
  console.log('Received:', message.text);
  
  // Send response
  await adapter.sendMessage(
    message.chatId,
    'Hello! How can I help you?'
  );
});

// Start the adapter
await adapter.start();
```

## Configuration

```typescript
{
  token: string;              // Bot API token from @BotFather
  mode: 'polling' | 'webhook';
  
  // Polling settings
  polling?: {
    timeout?: number;         // Long polling timeout (default: 30)
    interval?: number;        // Interval between requests (default: 0)
    allowedUpdates?: string[]; // Update types to receive
  };
  
  // Webhook settings
  webhook?: {
    url: string;              // Public webhook URL
    path?: string;            // Webhook endpoint path
    secretToken?: string;     // Secret for verification
  };
  
  // DM Policy
  dmPolicy?: 'pairing' | 'allowlist' | 'open' | 'disabled';
  allowlist?: string[];       // User IDs in allowlist
  
  // Streaming
  streaming?: {
    enabled?: boolean;
    minEditInterval?: number;  // Min ms between edits (default: 500)
    maxEditsPerMessage?: number;
  };
  
  // Rate limiting
  rateLimit?: {
    messagesPerSecond?: number;  // Global limit (default: 25)
    messagesPerMinutePerGroup?: number; // Group limit (default: 18)
  };
  
  // Formatting
  defaultParseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  typingIndicator?: boolean;
  commandPrefix?: string;     // Default: '/'
}
```

## Usage Examples

### Sending Messages

```typescript
// Simple text message
await adapter.sendMessage(chatId, 'Hello!');

// With Markdown formatting
await adapter.sendMessage(chatId, '*Bold* and `code`', {
  parseMode: 'Markdown'
});

// With inline keyboard
await adapter.sendMessage(chatId, 'Choose an option:', {
  replyMarkup: {
    inline_keyboard: [[
      { text: 'Yes', callback_data: 'yes' },
      { text: 'No', callback_data: 'no' }
    ]]
  }
});
```

### Streaming Responses

```typescript
async function* generateResponse() {
  yield 'Processing';
  await delay(500);
  yield 'Processing.';
  await delay(500);
  yield 'Processing..';
  await delay(500);
  yield 'Done!';
}

await adapter.sendStreaming(chatId, generateResponse());
```

### Sending Media

```typescript
// Send photo
await adapter.sendMedia(chatId, {
  type: 'photo',
  source: photoBuffer,
  caption: 'Look at this!'
});

// Send document
await adapter.sendMedia(chatId, {
  type: 'document',
  source: '/path/to/file.pdf',
  caption: 'Here is the document'
});
```

### Custom Commands

```typescript
adapter.commandHandler.registerCommand('hello', async (ctx) => {
  await adapter.sendMessage(
    ctx.message.chatId,
    `Hello ${ctx.message.displayName}!`
  );
});

// Handle with arguments
adapter.commandHandler.registerCommand('echo', async (ctx) => {
  const text = ctx.args.join(' ');
  await adapter.sendMessage(ctx.message.chatId, text);
});
```

### Callback Queries

```typescript
adapter.callbackHandler.registerCallback('yes', async (ctx) => {
  await adapter.sendMessage(
    ctx.query.chatId!,
    'You clicked Yes!'
  );
});

// Pattern matching
adapter.callbackHandler.registerCallback(/^action:(.+)$/, async (ctx) => {
  const { action, params } = adapter.callbackHandler.parseCallbackData(ctx.data);
  // Handle action...
});
```

### Typing Indicator

```typescript
const indicator = adapter.typingIndicator.start(chatId);

try {
  // Do some processing...
  await processRequest();
} finally {
  indicator.stop();
}
```

### DM Policy

```typescript
// Pairing mode - generate code for new users
adapter.on('message', async (message) => {
  if (!isUserAllowed(message.userId)) {
    const code = adapter.dmPolicyHandler.generatePairingCode(message.userId);
    await adapter.sendMessage(
      message.chatId,
      `Your pairing code: ${code}`
    );
  }
});

// Approve pairing
const approved = adapter.approvePairing(userId, code);
if (approved) {
  await adapter.sendMessage(userId, 'Access granted!');
}
```

## Architecture

```
Telegram Servers
       │
       │ Updates (polling/webhook)
       ▼
┌─────────────────────────────────────┐
│     TELEGRAM CHANNEL ADAPTER        │
│                                     │
│  Update Receiver                    │
│       ↓                             │
│  Update Parser                      │
│       ↓                             │
│  Message Processor                  │
│       ↓                             │
│  Session Router → Agent Loop        │
│       ↑                             │
│  Block Streamer                     │
│       ↓                             │
│  Streaming Sender                   │
│       ↓                             │
│  Rate Limiter → Message Sender      │
│                                     │
└─────────────────────────────────────┘
```

## Events

```typescript
adapter.on('message', (message) => {
  // Incoming message
});

adapter.on('command', (message) => {
  // Incoming command
});

adapter.on('callback', (query) => {
  // Callback query from inline keyboard
});

adapter.on('error', (error) => {
  // Error occurred
});

adapter.on('started', () => {
  // Adapter started
});

adapter.on('stopped', () => {
  // Adapter stopped
});
```

## Error Handling

The adapter automatically handles Telegram API errors:

- **400 Bad Request**: Notifies user about invalid input
- **401 Unauthorized**: Fatal - stops adapter
- **403 Forbidden**: Skips blocked/kicked chats
- **404 Not Found**: Skips missing chats
- **429 Rate Limit**: Waits and retries
- **500+ Server Error**: Retries with exponential backoff

## Rate Limiting

Telegram has strict rate limits:

- **30 messages/second** globally
- **20 messages/minute** per group

The adapter automatically manages these limits:

```typescript
// This will wait if rate limit is reached
await adapter.sendMessage(chatId, 'Message 1');
await adapter.sendMessage(chatId, 'Message 2');
await adapter.sendMessage(chatId, 'Message 3');
```

## Message Splitting

Long messages (>4096 characters) are automatically split:

```typescript
const longText = generateLongText();

// Automatically split into multiple messages
await adapter.sendMessage(chatId, longText);
```

## Integration with Agent Loop

```typescript
import { AgentLoop } from '../agent-loop';
import { TelegramAdapter } from '../telegram-adapter';

const adapter = new TelegramAdapter({ /* config */ });
const agentLoop = new AgentLoop({ /* config */ });

adapter.on('message', async (message) => {
  // Skip if not allowed
  const access = adapter.dmPolicyHandler.checkAccess(message.userId);
  if (!access.allowed) return;
  
  // Get session key
  const sessionKey = adapter.sessionRouter.getSessionKey(message);
  
  // Start typing indicator
  const indicator = adapter.typingIndicator.start(message.chatId);
  
  try {
    // Send to agent
    const stream = agentLoop.run({
      sessionKey,
      message: message.text,
      userId: message.userId,
    });
    
    // Stream response back
    await adapter.sendStreaming(message.chatId, stream);
  } finally {
    indicator.stop();
  }
});

await adapter.start();
```

## Testing

```bash
# Unit tests
npm test src/telegram-adapter/__tests__/

# Integration tests
TELEGRAM_BOT_TOKEN=xxx npm test src/telegram-adapter/__tests__/integration.test.ts
```

## Security

- ✅ Webhook secret token verification
- ✅ DM policy enforcement
- ✅ Pairing codes with expiry
- ✅ Allowlist management
- ✅ Rate limiting
- ✅ Input validation
- ✅ Error message sanitization

## Performance

- Efficient rate limiting with minimal overhead
- Streaming edits reduce message count
- Automatic message splitting
- Connection pooling for webhooks
- Graceful degradation on errors

## Limitations

- Maximum message length: 4096 characters (auto-split)
- Maximum file size: 50 MB
- Maximum callback data: 64 bytes
- Rate limits: 30/sec global, 20/min per group
- Edit limit: ~5 seconds after message sent

## Troubleshooting

### Bot doesn't respond

1. Check token is valid: `adapter.getMe()`
2. Verify bot is running: `adapter.isRunning()`
3. Check DM policy: User might need pairing code

### Messages are delayed

- Rate limiting in effect
- Check: `adapter.rateLimiter.getStats()`

### Edits not working

- Message too old (>48 hours)
- Message deleted
- Content identical (not modified)

### Webhook not receiving updates

1. URL must be HTTPS
2. Port must be 443, 80, 88, or 8443
3. Valid SSL certificate required
4. Check webhook info: `getWebhookInfo`

## License

MIT
