# Context Assembler

The Context Assembler module prepares complete context for AI model API calls by assembling system prompts, transforming messages, collecting tools, and managing token limits.

## Overview

The Context Assembler is a critical integration module that:
- **Loads bootstrap files** (AGENT.md, SOUL.md, CONTEXT.md) with caching
- **Builds system prompts** from multiple sources (bootstrap files, skills, datetime, custom sections)
- **Transforms messages** from session format to model format
- **Collects tools** from executor and skills with filtering
- **Estimates tokens** using simple or tiktoken algorithms
- **Truncates context** when exceeding token limits (3 strategies: simple, smart, sliding)
- **Resolves parameters** from 4 layers (system → agent → session → request)
- **Detects compaction needs** based on token/message/tool call thresholds
- **Caches results** with configurable TTL

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ContextAssembler                         │
│                        (Facade)                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                        Assembler                             │
│                   (Core Orchestrator)                        │
└─┬───────┬────────┬────────┬────────┬────────┬───────┬──────┘
  │       │        │        │        │        │       │
  ▼       ▼        ▼        ▼        ▼        ▼       ▼
┌───┐  ┌───┐   ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐
│ T │  │ B │   │ S  │  │ M  │  │ T  │  │ C  │  │ D  │
│ o │  │ o │   │ y  │  │ e  │  │ o  │  │ o  │  │ e  │
│ k │  │ o │   │ s  │  │ s  │  │ o  │  │ m  │  │ f  │
│ e │  │ t │   │ t  │  │ s  │  │ l  │  │ p  │  │ a  │
│ n │  │ s │   │ e  │  │ a  │  │    │  │ a  │  │ u  │
│   │  │ t │   │ m  │  │ g  │  │ C  │  │ c  │  │ l  │
│ E │  │ r │   │    │  │ e  │  │ o  │  │ t  │  │ t  │
│ s │  │ a │   │ P  │  │    │  │ l  │  │ i  │  │ s  │
│ t │  │ p │   │ r  │  │ T  │  │ l  │  │ o  │  │    │
│ i │  │   │   │ o  │  │ r  │  │ e  │  │ n  │  │    │
│ m │  │   │   │ m  │  │ a  │  │ c  │  │    │  │    │
│ a │  │   │   │ p  │  │ n  │  │ t  │  │    │  │    │
│ t │  │   │   │ t  │  │ s  │  │ o  │  │    │  │    │
│ o │  │   │   │    │  │ f  │  │ r  │  │    │  │    │
│ r │  │   │   │ B  │  │ o  │  │    │  │    │  │    │
│   │  │   │   │ u  │  │ r  │  │    │  │    │  │    │
│   │  │   │   │ i  │  │ m  │  │    │  │    │  │    │
│   │  │   │   │ l  │  │ e  │  │    │  │    │  │    │
│   │  │   │   │ d  │  │ r  │  │    │  │    │  │    │
│   │  │   │   │ e  │  │    │  │    │  │    │  │    │
│   │  │   │   │ r  │  │    │  │    │  │    │  │    │
└───┘  └───┘   └────┘  └────┘  └────┘  └────┘  └────┘
```

## Installation

```bash
npm install
```

## Quick Start

```typescript
import { createContextAssembler } from './context-assembler';
import type { SessionStore, ToolExecutor } from './context-assembler';

// Setup dependencies
const sessionStore: SessionStore = {
  getMessages: async (sessionId) => [...],
  getMetadata: async (sessionId) => ({ ... }),
};

const toolExecutor: ToolExecutor = {
  list: () => [...],
  getForModel: (options) => [...],
};

// Create assembler
const assembler = createContextAssembler(
  { sessionStore, toolExecutor },
  {
    defaultModel: 'claude-3-7-sonnet',
    defaultTemperature: 0.7,
    truncationStrategy: 'smart',
  }
);

// Assemble context
const context = await assembler.assemble('session-123', 'agent-1');

console.log(context.systemPrompt);     // System prompt
console.log(context.messages);         // Transformed messages
console.log(context.tools);            // Available tools
console.log(context.parameters);       // Model parameters
console.log(context.metadata);         // Assembly metadata
```

## Core Components

### 1. Token Estimator

Estimates token count for text, images, and tool definitions.

```typescript
import { TokenEstimator } from './context-assembler';

const estimator = new TokenEstimator({ mode: 'simple' });

// Estimate text
const tokens = await estimator.estimateText('Hello, world!');

// Estimate message
const messageTokens = await estimator.estimateMessage({
  role: 'user',
  content: 'Hello',
});

// Estimate tools
const toolTokens = await estimator.estimateTools([...toolDefinitions]);
```

**Token Estimation Modes:**
- `simple`: ~4 chars = 1 token (fast, approximate)
- `tiktoken`: Accurate tokenization using tiktoken library (requires `npm install tiktoken`)

**Special Cases:**
- Russian text: ~2.5 chars per token
- CJK text: ~1.5 chars per token
- Images: 85-255 tokens based on size
- Tool calls: name + input + 5 tokens overhead

### 2. Model Limits Registry

Defines context windows and capabilities for 12 supported models.

```typescript
import { getModelLimits, supportsFeature } from './context-assembler';

const limits = getModelLimits('claude-3-7-sonnet');
console.log(limits.contextWindow);          // 200,000
console.log(limits.maxOutput);              // 8,192
console.log(limits.supportsTools);          // true
console.log(limits.supportsThinking);       // true

// Check feature support
if (supportsFeature('gpt-4o', 'vision')) {
  // Use vision features
}
```

**Supported Models:**
- Claude: 3.7 Sonnet, 3.5 Sonnet, 3 Opus, 3 Haiku
- GPT: 4o, 4o Mini, 4 Turbo, 4, 3.5 Turbo
- Gemini: 2.0 Flash, 1.5 Pro, 1.5 Flash

### 3. Bootstrap File Loader

Loads AGENT.md, SOUL.md, CONTEXT.md with caching.

```typescript
import { BootstrapFileLoader } from './context-assembler';

const loader = new BootstrapFileLoader({
  bootstrapPath: './bootstrap',
  enableCaching: true,
  cacheTTL: 60_000, // 60 seconds
});

// Load all files
const files = await loader.loadAll();
console.log(files.agent);   // AGENT.md content
console.log(files.soul);    // SOUL.md content
console.log(files.context); // CONTEXT.md content

// Load agent-specific file
const agentFile = await loader.loadForAgent('research', 'agent');
// Tries AGENT.research.md first, falls back to AGENT.md
```

### 4. System Prompt Builder

Assembles system prompt from 8 sections with priorities.

```typescript
import { SystemPromptBuilder } from './context-assembler';

const builder = new SystemPromptBuilder('\n\n---\n\n');

const sections = [
  {
    name: 'agent',
    content: 'You are a helpful assistant',
    priority: 1000, // Higher = appears first
  },
  {
    name: 'datetime',
    content: 'Current datetime: 2024-01-01 12:00:00 UTC',
    priority: 100,
  },
];

const prompt = builder.build(sections);
```

**Standard Sections (by priority):**
1. **Agent definition** (1000): From AGENT.md
2. **Soul/personality** (900): From SOUL.md
3. **Context instructions** (800): From CONTEXT.md
4. **Skills** (500): From active skills
5. **Tools summary** (400): Optional list of available tools
6. **Additional context** (300): Custom additions
7. **Datetime** (100): Current datetime in specified format
8. **Custom sections**: Any priority

### 5. Message Transformer

Transforms messages from session format to model format.

```typescript
import { MessageTransformer } from './context-assembler';

const transformer = new MessageTransformer();

// Transform single message
const modelMessage = transformer.transform(sessionMessage);

// Transform many
const messages = transformer.transformMany(sessionMessages);

// Merge consecutive same-role messages
const merged = transformer.mergeConsecutive(messages);

// Ensure alternating user/assistant pattern
const alternating = transformer.ensureAlternating(messages);

// Full pipeline
const transformed = transformer.transformComplete(sessionMessages);
```

**Message Type Mapping:**
- `user` → `user`
- `assistant` → `assistant`
- `tool_call` → `assistant`
- `tool_result` → `user`
- `compaction` → `assistant`
- `system` → `system`

### 6. Tool Collector

Collects and filters tools from multiple sources.

```typescript
import { ToolCollector } from './context-assembler';

const collector = new ToolCollector(toolExecutor);

// Collect from executor with filtering
const tools = await collector.collectFromExecutor({
  sandboxMode: true,
  permissions: ['fs.read', 'network.*'],
  exclude: ['dangerous_tool'],
});

// Collect from skills
const skillTools = await collector.collectFromSkills(skills);

// Merge tools (deduplicates by name)
const allTools = collector.mergeTools(tools, skillTools);

// Full collection
const collected = await collector.collect(skills, {
  sandboxMode: false,
  permissions: ['*'],
});
```

### 7. Context Truncation

Truncates messages to fit token limits using 3 strategies.

```typescript
import { ContextTruncator } from './context-assembler';

const truncator = new ContextTruncator(tokenEstimator, messageTransformer);

const result = await truncator.truncate(messages, {
  strategy: 'smart',        // 'simple' | 'smart' | 'sliding'
  maxTokens: 100_000,
  reserveTokens: 2_000,
  systemPromptTokens: 500,
  toolsTokens: 1_000,
});

console.log(result.messages);          // Truncated messages
console.log(result.info.removedCount); // Number of removed messages
console.log(result.info.removedTokens);// Tokens saved
```

**Truncation Strategies:**

**Simple:** Remove oldest messages until fits
```
[M1, M2, M3, M4, M5] → [M3, M4, M5]
```

**Smart:** Preserve tool call/result pairs
```
[M1, ToolCall, ToolResult, M4] → [ToolCall, ToolResult, M4]
```

**Sliding:** Keep most recent messages
```
[M1, M2, M3, M4, M5] → [M4, M5]
```

### 8. Defaults Resolution

Resolves parameters from 4 layers with precedence.

```typescript
import { DefaultsResolver } from './context-assembler';

const resolver = new DefaultsResolver(config);

const parameters = resolver.resolve(
  { temperature: 0.8 },           // Agent defaults
  { maxTokens: 4096 },            // Session defaults
  { modelId: 'gpt-4o' }           // Request overrides
);

// Result:
// {
//   modelId: 'gpt-4o',           (from request)
//   temperature: 0.8,            (from agent)
//   maxTokens: 4096,             (from session)
//   ... (system defaults for rest)
// }
```

**Layer Precedence (highest to lowest):**
1. **Request overrides**: Passed to `assemble()` call
2. **Session defaults**: Stored in session metadata
3. **Agent defaults**: Stored in agent metadata
4. **System defaults**: From configuration

### 9. Compaction Detection

Detects when session needs compaction.

```typescript
import { CompactionDetector } from './context-assembler';

const detector = new CompactionDetector(config);

const stats = detector.calculateStats(
  150,      // message count
  180_000,  // token count
  25,       // tool call count
);

const check = detector.check(stats, 180_000, 200_000);

console.log(check.needed);   // true
console.log(check.reason);   // 'token_limit' | 'message_count' | 'tool_count' | 'explicit'
```

**Compaction Triggers:**
- **Token limit**: Exceeds 80% of context window (configurable)
- **Message count**: > 100 messages (configurable)
- **Tool count**: > 50 tool calls
- **Explicit**: Manual request

### 10. Caching Layer

Caches assembled contexts with TTL.

```typescript
import { AssemblyCache } from './context-assembler';

const cache = new AssemblyCache(60_000); // 60 second TTL

// Get from cache
const context = cache.get('session-123', { modelId: 'gpt-4o' });

// Set in cache
cache.set('session-123', { modelId: 'gpt-4o' }, assembledContext);

// Invalidate session
cache.invalidate('session-123');

// Get stats
const stats = cache.getStats();
console.log(stats.hits);       // Cache hits
console.log(stats.misses);     // Cache misses
console.log(stats.hitRate);    // Hit rate (0-1)
```

## Configuration

```typescript
const config: ContextAssemblerConfig = {
  // Paths
  bootstrapPath: './bootstrap',
  
  // Defaults
  defaultModel: 'claude-3-7-sonnet',
  defaultTemperature: 0.7,
  defaultMaxTokens: 8192,
  
  // Truncation
  truncationStrategy: 'smart',
  reserveTokensForResponse: 2000,
  
  // Compaction
  compactionThreshold: 0.8,              // Trigger at 80% of context
  compactionMessageThreshold: 100,       // Trigger at 100 messages
  
  // System prompt
  includeDatetime: true,
  datetimeFormat: 'YYYY-MM-DD HH:mm:ss',
  datetimeTimezone: 'UTC',
  sectionSeparator: '\n\n---\n\n',
  
  // Caching
  enableCaching: true,
  cacheFileTTL: 60_000,                  // 60 seconds
  
  // Features
  generateToolsSummary: false,
  includeExamplesInPrompt: false,
};
```

## Assembly Options

```typescript
const context = await assembler.assemble('session-id', 'agent-id', {
  // Model overrides
  modelId: 'gpt-4o',
  temperature: 0.9,
  maxTokens: 8192,
  topP: 0.95,
  topK: 50,
  thinkingLevel: 'high',
  thinkingBudget: 10_000,
  
  // System prompt
  additionalSystemPrompt: 'You are an expert in...',
  
  // Tools
  additionalTools: [...],
  disabledTools: ['dangerous_tool'],
  
  // Context control
  maxContextTokens: 100_000,
  reserveTokens: 3_000,
  
  // Skills
  skipSkills: false,
  skillFilter: ['math', 'code'],
  
  // Sandbox
  sandboxMode: true,
  
  // Permissions
  permissions: ['fs.read', 'network.*'],
});
```

## Skills Integration

```typescript
const skillProvider: SkillProvider = {
  getActiveSkills: async (agentId, sessionId) => [
    {
      id: 'math',
      name: 'Mathematics',
      instructions: 'You are excellent at mathematics',
      tools: [...mathTools],
      examples: ['Calculate 2+2', 'Solve equations'],
      priority: 100,
    },
  ],
  getSkillInstructions: async (skillId) => '...',
  getSkillTools: async (skillId) => [...],
  getSkillPriority: async (skillId) => 100,
};

const assembler = createContextAssembler({
  sessionStore,
  toolExecutor,
  skillProvider,  // Optional
});
```

## Assembled Context

```typescript
interface AssembledContext {
  systemPrompt: string;           // Complete system prompt
  messages: ModelMessage[];       // Transformed messages
  tools: ToolDefinition[];        // Available tools
  parameters: ModelParameters;    // Resolved parameters
  metadata: {
    sessionId: string;
    modelId: string;
    tokenEstimate: {
      systemPrompt: number;
      messages: number;
      tools: number;
      total: number;
    };
    truncated: boolean;
    truncationInfo?: {
      strategy: string;
      removedCount: number;
      removedTokens: number;
      originalTokens: number;
      finalTokens: number;
    };
    shouldCompact: boolean;
    compactionReason?: string;
    activeSkills: string[];
    assemblyTime: number;         // Milliseconds
  };
}
```

## Examples

### Example 1: Basic Assembly

```typescript
const assembler = createContextAssembler({
  sessionStore,
  toolExecutor,
});

const context = await assembler.assemble('session-123');

// Use with model API
const response = await modelClient.chat({
  system: context.systemPrompt,
  messages: context.messages,
  tools: context.tools,
  ...context.parameters,
});
```

### Example 2: Custom Model and Temperature

```typescript
const context = await assembler.assemble('session-123', 'agent-1', {
  modelId: 'gpt-4o',
  temperature: 0.9,
  maxTokens: 16384,
});
```

### Example 3: Sandbox Mode

```typescript
const context = await assembler.assemble('session-123', 'agent-1', {
  sandboxMode: true,
  permissions: ['fs.read'],  // Only allow read access
  disabledTools: ['execute_code'],
});
```

### Example 4: Skills Filtering

```typescript
const context = await assembler.assemble('session-123', 'agent-1', {
  skillFilter: ['math', 'code'],  // Only math and code skills
});
```

### Example 5: Check Compaction

```typescript
const check = await assembler.checkCompaction('session-123');

if (check.needed) {
  console.log(`Compaction needed: ${check.reason}`);
  console.log(`Current: ${check.currentTokens} tokens`);
  console.log(`Threshold: ${check.threshold} tokens`);
  
  // Trigger compaction in Agent Loop
}
```

### Example 6: Cache Management

```typescript
// Invalidate cache after session update
await sessionStore.addMessage(sessionId, message);
assembler.invalidateCache(sessionId);

// Get cache stats
const stats = assembler.getCacheStats();
console.log(`Hit rate: ${stats.assembly.hits / (stats.assembly.hits + stats.assembly.misses)}`);
```

## Testing

```bash
# Run all tests
npm test src/context-assembler

# Run specific test file
npm test src/context-assembler/__tests__/01-basic.test.ts

# With coverage
npm test -- --coverage src/context-assembler
```

## Performance

- **Assembly time**: < 100ms for typical sessions (50 messages, 10 tools)
- **Caching**: 10-100x speedup for cached results
- **Token estimation**: ~1μs per message (simple mode)
- **Truncation**: Linear time O(n) in message count

## Dependencies

- **Required**: None (self-contained)
- **Optional**: `tiktoken` for accurate token estimation
- **Peer**: Session Store, Tool Executor interfaces

## Integration

```typescript
// With Session Store
const sessionStore = new SessionStore(eventBus);

// With Tool Executor
const toolExecutor = new ToolExecutor(config);

// With Skill Provider (custom)
const skillProvider = createSkillProvider();

// Create assembler
const assembler = createContextAssembler({
  sessionStore,
  toolExecutor,
  skillProvider,
});
```

## Error Handling

```typescript
try {
  const context = await assembler.assemble('session-123');
} catch (err) {
  if (err.message.includes('Model ID is required')) {
    // Handle missing model ID
  } else if (err.message.includes('Temperature must be')) {
    // Handle invalid parameter
  } else {
    // Handle other errors
  }
}
```

## Best Practices

1. **Use caching**: Enable caching for production (60s TTL recommended)
2. **Choose truncation strategy**: 
   - `simple` for speed
   - `smart` for preserving tool interactions
   - `sliding` for recency-focused tasks
3. **Reserve tokens**: Leave 2000-3000 tokens for model response
4. **Monitor compaction**: Check `shouldCompact` flag and trigger compaction proactively
5. **Invalidate cache**: Clear cache after session mutations
6. **Use skills**: Organize reusable instructions as skills instead of hardcoding in prompts
7. **Test bootstrap files**: Verify AGENT.md, SOUL.md exist and are readable
8. **Set model limits**: Update `MODEL_LIMITS` when new models are released

## License

MIT
