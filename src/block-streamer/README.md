# Block Streamer Module

Transform continuous token streams from AI models into discrete, channel-optimized text blocks.

## Overview

The Block Streamer module solves a critical UX problem: AI models generate tokens one at a time, but:
- Sending each token separately = spam
- Waiting for the complete response = poor UX
- Different channels have different limits and capabilities

Block Streamer finds the optimal balance by:
- **Chunking** - Breaking stream into meaningful blocks
- **Coalescing** - Merging small blocks to reduce message count
- **Adapting** - Respecting channel-specific limits and features
- **Protecting** - Never breaking code fences or markdown mid-construct

## Quick Start

```typescript
import { createBlockStreamer } from './block-streamer';

// Create streamer for Telegram
const streamer = createBlockStreamer({
  profile: 'telegram',
  mode: 'streaming',
  onBlock: (block) => {
    console.log('Block ready:', block.content);
  },
});

// Feed token stream
streamer.push('Hello ');
streamer.push('World!');
streamer.complete();
```

## Channel Profiles

### Predefined Profiles

| Channel | Max Chars | Max Lines | Supports Edit | Mode |
|---------|-----------|-----------|---------------|------|
| **telegram** | 4,096 | ∞ | ✅ | streaming |
| **whatsapp** | 65,536 | ∞ | ❌ | block |
| **discord** | 2,000 | 17 | ✅ | streaming |
| **slack** | 40,000 | ∞ | ✅ | block |
| **web** | ∞ | ∞ | ✅ | streaming |
| **console** | ∞ | ∞ | ❌ | streaming |

### Custom Profiles

```typescript
import { registerProfile } from './block-streamer';

registerProfile('custom', {
  maxChars: 1000,
  maxLines: null,
  minChars: 50,
  supportsEdit: true,
  supportsMarkdown: true,
  coalesceGap: 200,
  defaultMode: 'block',
});
```

## Streaming Modes

### Block Mode
Emits complete blocks as they become ready.

```typescript
const streamer = createBlockStreamer({
  mode: 'block',
  onBlock: (block) => {
    sendMessage(block.content);
  },
});
```

**Best for:** WhatsApp, Slack, channels without edit support

### Streaming Mode
Sends progressive updates to a single message.

```typescript
const streamer = createBlockStreamer({
  mode: 'streaming',
  onUpdate: (update) => {
    updateMessage(messageId, update.fullContent);
  },
});
```

**Best for:** Telegram, Discord, Web UI with live updates

### Batch Mode
Accumulates everything, emits blocks only on complete.

```typescript
const streamer = createBlockStreamer({
  mode: 'batch',
  onBlock: (block) => {
    batchBlocks.push(block);
  },
});

// ... stream tokens ...

streamer.complete(); // Now blocks are emitted
```

**Best for:** Email, reports, non-interactive contexts

## Features

### 1. Smart Break Points

Priority order:
1. **Paragraph** (`\n\n`) - Best break
2. **Sentence** (`. ` or `! ` or `? `) - Good break
3. **Line** (`\n`) - Acceptable break
4. **Clause** (`, ` or `; ` or `: `) - OK break
5. **Word** (` `) - Minimum break
6. **Hard** (at maxChars) - Last resort

```typescript
const text = `
First paragraph.

Second paragraph. This has multiple sentences.
Third paragraph.
`;

// Will break at paragraph boundaries first
```

### 2. Code Fence Protection

Never breaks inside code blocks:

```typescript
const code = `
\`\`\`python
def hello():
    print("This stays together!")
\`\`\`
`;

// Block streamer won't break this in the middle
```

Supports:
- Triple backticks: ` ``` `
- Triple tildes: `~~~`
- Language tags: ` ```python `

### 3. Coalescing

Merges small blocks to reduce message spam:

```typescript
// Without coalescing: 5 messages
push('Hi');
push(' ');
push('there');
push('!');
push(' How');

// With coalescing: 1-2 messages
// "Hi there! How are you?"
```

Configured via `coalesceGap` (milliseconds between chunks).

### 4. Markdown Safety

Protects markdown constructs from breaking:

```typescript
const text = 'This is **bold text** and `code`';

// Won't break in the middle of **bold**
// Won't break in the middle of `code`
```

Supports:
- Bold: `**text**` or `__text__`
- Italic: `*text*` or `_text_`
- Code: `` `code` ``
- Links: `[text](url)`
- Strikethrough: `~~text~~`

### 5. Line Counting

For channels with line limits (e.g., Discord's 17 visible lines):

```typescript
const streamer = createBlockStreamer({
  profile: 'discord', // maxLines: 17
});

// Automatically breaks before exceeding 17 lines
```

## Usage Examples

### With Agent Loop

```typescript
import { createBlockStreamer } from './block-streamer';
import { AgentLoop } from './agent-loop';

const agent = new AgentLoop(dependencies);
const handle = await agent.execute({ message: 'Hello' });

const streamer = createBlockStreamer({
  profile: 'telegram',
  onBlock: async (block) => {
    await telegram.sendMessage(chatId, block.content);
  },
});

for await (const event of handle.events) {
  if (event.type === 'model.delta') {
    streamer.push(event.delta);
  }
  
  if (event.type === 'model.complete') {
    streamer.complete();
  }
}
```

### Multi-Channel Streaming

Stream to multiple channels simultaneously:

```typescript
import { streamToChannels } from './block-streamer/agent-loop-integration';

await streamToChannels(modelStream, [
  {
    profile: 'telegram',
    onBlock: (block) => sendToTelegram(block),
  },
  {
    profile: 'discord',
    onBlock: (block) => sendToDiscord(block),
  },
  {
    profile: 'web',
    onBlock: (block) => sendToWebSocket(block),
  },
]);
```

### Custom Configuration

```typescript
const streamer = createBlockStreamer(
  {
    profile: 'telegram',
    mode: 'streaming',
    protectCodeFences: true,
    protectMarkdown: true,
    autoCloseConstructs: true,
    enableCoalescing: true,
    customMinChars: 200,
    customMaxChars: 3000,
  },
  {
    // Global config overrides
    defaultCoalesceGap: 300,
    bufferImplementation: 'rope', // For large texts
  }
);
```

### State Monitoring

```typescript
const streamer = createBlockStreamer({ profile: 'web' });

streamer.push('Some text');

const state = streamer.getState();
console.log('Buffered:', state.bufferedChars);
console.log('Emitted:', state.emittedBlocks);
console.log('In code fence:', state.isInCodeFence);

const stats = streamer.getStats();
console.log('Input chars:', stats.totalInputChars);
console.log('Output blocks:', stats.totalOutputBlocks);
console.log('Avg block size:', stats.avgBlockSize);
```

## API Reference

### createBlockStreamer(options?, config?)

Create a new BlockStreamer instance.

**Options:**
- `profile` - Channel profile name or custom profile object
- `mode` - Streaming mode: 'block' | 'streaming' | 'batch'
- `onBlock` - Callback when block is ready
- `onUpdate` - Callback for streaming updates
- `onComplete` - Callback on completion
- `onError` - Error callback
- `protectCodeFences` - Don't break inside code blocks (default: true)
- `protectMarkdown` - Don't break markdown constructs (default: true)
- `enableCoalescing` - Merge small blocks (default: true)

### BlockStreamer Methods

#### push(text: string): void
Add text to the stream. May trigger block emissions.

#### flush(): void
Force emit buffered content.

#### complete(): void
Mark stream as complete and emit final blocks.

#### abort(): void
Cancel stream without emitting remaining content.

#### getState(): StreamerState
Get current state (buffered chars, emitted blocks, etc.).

#### getStats(): StreamerStats
Get statistics (total chars, blocks, duration, etc.).

#### setProfile(name: string): void
Change channel profile mid-stream.

#### configure(options): void
Update configuration dynamically.

## Architecture

```
Token Stream → Buffer → Chunker → Coalescer → Emitter → Channel
                  ↓         ↓          ↓
            Fence Track  Break Find   Events
```

**Components:**
1. **Text Buffer** - Efficient text accumulation
2. **Fence Tracker** - Detects code fence state
3. **Break Point Finder** - Finds optimal split points
4. **Chunker** - Main chunking logic
5. **Coalescer** - Merges small chunks
6. **Line Counter** - Counts lines for limits
7. **Markdown Safety** - Protects formatting
8. **Mode Handlers** - Block/Streaming/Batch logic

## Performance

**Benchmarks:**
- ✅ 1MB text processed in < 100ms
- ✅ Memory usage stays constant (streaming-friendly)
- ✅ Latency per chunk: < 5ms

**Optimizations:**
- Lazy regex compilation
- Efficient string buffer (rope for large texts)
- Minimal string copies
- Streaming-friendly memory usage

## Testing

```bash
npm test -- block-streamer
```

**Test Coverage:**
- ✅ Text buffer operations
- ✅ Code fence tracking
- ✅ Break point finding
- ✅ Channel profiles
- ✅ Chunking logic
- ✅ Coalescing
- ✅ All streaming modes
- ✅ Edge cases (empty, huge, unicode, etc.)

## Edge Cases Handled

- ✅ Empty text
- ✅ Only whitespace
- ✅ Text without break points
- ✅ Code fence at start/end
- ✅ Unclosed code fence
- ✅ Code fence longer than maxChars
- ✅ Nested markdown
- ✅ Unicode characters (emoji, RTL, etc.)
- ✅ Text exactly at maxChars
- ✅ Very fast/slow input
- ✅ Push after complete/abort

## Integration Points

### Incoming
None - self-contained module

### Outgoing
- **Agent Loop** - Processes model output
- **Channel Adapters** - Receives blocks for sending
- **Web UI** - Receives streaming updates

## Next Steps

After Block Streamer:
1. **Channel Adapters** - Telegram, WhatsApp, Discord implementations
2. **Web UI** - Browser-based interface with live streaming
3. **Analytics** - Track block metrics and performance
