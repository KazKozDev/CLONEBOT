# Agent Loop

Main orchestrator for agent execution. Coordinates all modules to deliver a complete agent experience.

## Overview

The Agent Loop is the "conductor" that coordinates:
- **Context Assembler**: Prepares context and prompts
- **Model Adapter**: Streams AI responses
- **Tool Executor**: Executes tool calls
- **Session Store**: Persists conversation history

## Architecture

### Run Lifecycle

```
pending → queued → running → completed/failed/cancelled/timeout
```

### Execution Flow

```
1. User Message
   ↓
2. Queue Management (serialize per session)
   ↓
3. Context Assembly (history + tools + prompt)
   ↓
4. Model Call (streaming)
   ↓
5. Tool Execution (if needed)
   ↓
6. Multi-turn Loop (repeat 4-5 until done)
   ↓
7. Session Persistence
   ↓
8. Metrics & Events
```

## Features

- **Event Streaming**: AsyncIterable stream of 21+ event types
- **Queue Management**: Per-session serialization + global concurrency
- **Multi-turn Conversations**: Automatic tool round management
- **Cancellation**: AbortSignal support at any stage
- **Retry Logic**: Exponential backoff for transient errors
- **Lifecycle Hooks**: 8 extension points for custom behavior
- **Metrics**: Comprehensive timing and usage statistics

## Usage

### Basic Example

```typescript
import { AgentLoop } from './agent-loop';
import { SessionStore } from './session-store';
import { ContextAssembler } from './context-assembler';
import { ModelAdapter } from './model-adapter';
import { ToolExecutor } from './tool-executor';

// Create dependencies
const sessionStore = new SessionStore(...);
const contextAssembler = new ContextAssembler(...);
const modelAdapter = new ModelAdapter(...);
const toolExecutor = new ToolExecutor(...);

// Create agent loop
const agentLoop = new AgentLoop({
  sessionStore,
  contextAssembler,
  modelAdapter,
  toolExecutor,
});

// Execute run
const handle = await agentLoop.execute({
  message: 'What is the weather in London?',
  sessionId: 'user-123',
});

// Stream events
for await (const event of handle.events) {
  if (event.type === 'model.delta') {
    process.stdout.write(event.delta);
  } else if (event.type === 'tool.start') {
    console.log(`\nExecuting tool: ${event.toolName}`);
  } else if (event.type === 'run.completed') {
    console.log('\nCompleted!', event.result);
  }
}
```

### With Hooks

```typescript
// Register lifecycle hooks
agentLoop.on('beforeRun', async ({ runId, sessionId }) => {
  console.log(`Starting run ${runId} for session ${sessionId}`);
});

agentLoop.on('afterContextAssembly', async ({ context }) => {
  console.log(`Context has ${context.messages.length} messages`);
});

agentLoop.on('beforeToolExecution', async ({ toolName, arguments: args }) => {
  console.log(`Calling tool: ${toolName}`, args);
});

agentLoop.on('onError', async ({ error, phase }) => {
  console.error(`Error in ${phase}:`, error);
});
```

### Cancellation

```typescript
const handle = await agentLoop.execute({
  message: 'Long running task',
  sessionId: 'user-123',
});

// Cancel after 5 seconds
setTimeout(() => handle.cancel(), 5000);

// Handle cancellation
for await (const event of handle.events) {
  if (event.type === 'run.cancelled') {
    console.log('Run was cancelled:', event.reason);
  }
}
```

### Configuration

```typescript
const agentLoop = new AgentLoop(deps, {
  concurrency: {
    maxConcurrentRuns: 20, // Global limit
    maxConcurrentToolCalls: 10, // Per run
  },
  limits: {
    maxTurns: 15, // Max conversation turns
    maxToolRounds: 8, // Max tool execution rounds
    maxToolCallsPerRound: 20, // Max tools per round
    queueTimeout: 60000, // Queue wait timeout (ms)
  },
  retry: {
    maxRetries: 5,
    initialDelay: 2000,
    maxDelay: 60000,
    backoffMultiplier: 2,
  },
});
```

## Event Types

### Lifecycle Events
- `run.queued`: Run added to queue
- `run.started`: Run started execution
- `run.completed`: Run completed successfully
- `run.error`: Run failed with error
- `run.cancelled`: Run was cancelled
- `run.timeout`: Run exceeded timeout

### Context Events
- `context.start`: Context assembly started
- `context.complete`: Context assembly completed

### Model Events
- `model.start`: Model call started
- `model.delta`: Text delta from model
- `model.thinking.delta`: Thinking delta (o1 models)
- `model.complete`: Model call completed

### Tool Events
- `tool.start`: Tool execution started
- `tool.progress`: Tool progress update
- `tool.complete`: Tool completed successfully
- `tool.error`: Tool execution failed

### Message Events
- `message.appended`: Message added to session

## Hooks

8 lifecycle hooks for extensibility:

1. **beforeRun**: Before run starts
2. **afterContextAssembly**: After context assembled
3. **beforeModelCall**: Before calling model
4. **afterModelCall**: After model responds
5. **beforeToolExecution**: Before executing tool
6. **afterToolExecution**: After tool completes
7. **afterRun**: After run completes
8. **onError**: When error occurs

## Metrics

Comprehensive metrics collected for each run:

```typescript
{
  contextAssembly: { duration: 150 },
  modelCalls: [
    { duration: 1200, tokens: { prompt: 500, completion: 150 } },
    { duration: 800, tokens: { prompt: 650, completion: 80 } },
  ],
  toolExecutions: [
    { duration: 300, toolName: 'get_weather', success: true },
  ],
  persistence: { duration: 50 },
  total: { duration: 2500 }
}
```

## Error Handling

### Retryable Errors

Automatically retries on:
- Rate limits
- Timeouts
- Network errors
- Connection refused
- DNS errors

### Graceful Degradation

- Tool errors don't fail the run
- Invalid tool calls are reported but handled
- Model errors are retried with backoff

## Testing

```bash
npm test src/agent-loop
```

## Type Reference

See [types.ts](./types.ts) for complete type definitions.

## Dependencies

- `SessionStore`: Session persistence
- `ContextAssembler`: Context preparation
- `ModelAdapter`: AI model interface
- `ToolExecutor`: Tool execution

## License

MIT
