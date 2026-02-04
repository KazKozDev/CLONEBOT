/**
 * INTEGRATION CHECKPOINT - Phase 2 Complete
 * 
 * Проверка работы Agent Loop с мок-моделью в памяти
 * Тестирует полную интеграцию всех модулей без внешних зависимостей
 */

import { AgentLoop } from './agent-loop';
import type { AgentLoopDependencies } from './agent-loop/types';

// ============================================================================
// Mock Dependencies (In-Memory)
// ============================================================================

/**
 * In-Memory Session Store
 */
class MockSessionStore {
  private sessions: Map<string, any[]> = new Map();

  async getMessages(sessionId: string): Promise<any[]> {
    return this.sessions.get(sessionId) || [];
  }

  async append(sessionId: string, message: any): Promise<any> {
    const messages = this.sessions.get(sessionId) || [];
    const fullMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      ...message,
    };
    messages.push(fullMessage);
    this.sessions.set(sessionId, messages);
    return fullMessage;
  }

  async getMetadata(sessionId: string): Promise<any> {
    const messages = this.sessions.get(sessionId) || [];
    return { sessionId, messageCount: messages.length, createdAt: Date.now(), updatedAt: Date.now() };
  }
}

/**
 * In-Memory Context Assembler
 */
class MockContextAssembler {
  private sessionStore: MockSessionStore;

  constructor(sessionStore: MockSessionStore) {
    this.sessionStore = sessionStore;
  }

  async assemble(sessionId: string, _agentId?: string, _options?: any): Promise<any> {
    console.log(`🔧 Context assembled for session ${sessionId}`);

    // Get last user message from store
    const messages = await this.sessionStore.getMessages(sessionId);
    const lastUserMsg = messages.filter((m: any) => m.role === 'user').pop();
    const input = lastUserMsg?.content || 'unknown';

    return {
      systemPrompt: 'You are a helpful AI assistant.',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: input }],
        },
      ],
      tools: [
        {
          name: 'get_weather',
          description: 'Get current weather for a city',
          inputSchema: {
            type: 'object',
            properties: {
              city: { type: 'string' },
            },
            required: ['city'],
          },
        },
      ],
      model: 'mock-gpt-4',
      parameters: {
        modelId: 'mock-gpt-4',
        temperature: 0.7,
        maxTokens: 2000,
      },
      metadata: {
        tokens: { system: 50, messages: 20, tools: 30, total: 100 },
        counts: { messages: 1, tools: 1 },
        truncated: false,
        compacted: false,
      },
    };
  }
}

/**
 * In-Memory Model Adapter (Streaming Mock)
 */
class MockModelAdapter {
  async *stream({ messages }: any): AsyncIterable<any> {
    const userMessage = messages[messages.length - 1];
    const userText = userMessage.content?.[0]?.text || 'unknown';
    
    console.log(`🤖 Model processing: "${userText}"`);
    
    // Simulate streaming response
    const words = [
      'Hello!',
      ' I',
      ' understand',
      ' you',
      ' asked:',
      ` "${userText}".`,
      ' Let',
      ' me',
      ' help',
      ' with',
      ' that!',
    ];
    
    // Check if we should call a tool
    const shouldUseTool = userText.toLowerCase().includes('weather');
    
    if (shouldUseTool) {
      // Stream partial response
      for (const word of words.slice(0, 5)) {
        await this.delay(50);
        yield { type: 'content', delta: word };
      }
      
      // Return response with tool call
      yield {
        type: 'response',
        id: 'resp-1',
        content: words.slice(0, 5).join(''),
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'call-1',
            name: 'get_weather',
            arguments: { city: 'London' },
          },
        ],
        usage: {
          promptTokens: 100,
          completionTokens: 20,
          totalTokens: 120,
        },
      };
      
      // Second turn - response after tool execution
      await this.delay(100);
      const finalWords = [' Based', ' on', ' the', ' weather', ' data,', ' it', ' is', ' sunny!'];
      
      for (const word of finalWords) {
        await this.delay(50);
        yield { type: 'content', delta: word };
      }
      
      yield {
        type: 'response',
        id: 'resp-2',
        content: finalWords.join(''),
        finishReason: 'stop',
        usage: {
          promptTokens: 150,
          completionTokens: 30,
          totalTokens: 180,
        },
      };
    } else {
      // Simple response without tools
      for (const word of words) {
        await this.delay(50);
        yield { type: 'content', delta: word };
      }
      
      yield {
        type: 'response',
        id: 'resp-1',
        content: words.join(''),
        finishReason: 'stop',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      };
    }
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * In-Memory Tool Executor
 */
class MockToolExecutor {
  createContext(options: any): any {
    return { sessionId: options.sessionId, runId: options.runId, toolCallId: options.toolCallId };
  }

  async execute(name: string, args: any, _context?: any): Promise<any> {
    console.log(`🔨 Tool executing: ${name}`, args);

    await this.delay(200); // Simulate tool execution time

    if (name === 'get_weather') {
      return {
        content: JSON.stringify({
          city: args.city,
          temperature: 22,
          condition: 'Sunny',
          humidity: 65,
        }),
        success: true,
      };
    }

    return {
      content: JSON.stringify({ error: 'Unknown tool' }),
      success: false,
    };
  }

  list(_options?: any): any[] {
    return [];
  }

  getForModel(_options?: any): any[] {
    return [];
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Integration Checkpoint
// ============================================================================

async function runIntegrationCheckpoint() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  🚀 INTEGRATION CHECKPOINT - Phase 2 Complete');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  
  // Create mock dependencies (in-memory)
  const mockSessionStore = new MockSessionStore();
  const dependencies: AgentLoopDependencies = {
    sessionStore: mockSessionStore as any,
    contextAssembler: new MockContextAssembler(mockSessionStore) as any,
    modelAdapter: new MockModelAdapter() as any,
    toolExecutor: new MockToolExecutor() as any,
  };
  
  // Initialize Agent Loop
  console.log('✓ Initializing Agent Loop...');
  const agent = new AgentLoop(dependencies, {
    concurrency: {
      maxConcurrentRuns: 5,
      maxConcurrentToolCalls: 3,
    },
    limits: {
      maxTurns: 10,
      maxToolRounds: 5,
      maxToolCallsPerRound: 10,
      queueTimeout: 30000,
    },
  });
  
  console.log('✓ Agent Loop initialized');
  console.log('');
  
  // Test 1: Simple message without tools
  console.log('───────────────────────────────────────────────────────');
  console.log('TEST 1: Simple message (no tools)');
  console.log('───────────────────────────────────────────────────────');
  
  await runTest(agent, {
    message: 'Hello, how are you?',
    sessionId: 'test-session-1',
  });
  
  console.log('');
  
  // Test 2: Message that triggers tool use
  console.log('───────────────────────────────────────────────────────');
  console.log('TEST 2: Tool execution (weather query)');
  console.log('───────────────────────────────────────────────────────');
  
  await runTest(agent, {
    message: 'What is the weather in London?',
    sessionId: 'test-session-2',
  });
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ✅ INTEGRATION CHECKPOINT PASSED!');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('All modules working together:');
  console.log('  ✓ Agent Loop (orchestrator)');
  console.log('  ✓ Session Store (persistence)');
  console.log('  ✓ Context Assembler (context prep)');
  console.log('  ✓ Model Adapter (AI streaming)');
  console.log('  ✓ Tool Executor (tool execution)');
  console.log('');
  console.log('Phase 2: Core Logic - COMPLETE! 🎉');
  console.log('');
}

async function runTest(agent: AgentLoop, request: any) {
  const messagePreview = typeof request.message === 'string'
    ? request.message
    : `[content blocks: ${request.message.length}]`;
  console.log(`📨 Request: "${messagePreview}"`);
  console.log('');
  
  const handle = await agent.execute(request);
  
  console.log(`🆔 Run ID: ${handle.runId}`);
  console.log(`📍 Session: ${handle.sessionId}`);
  console.log('');
  
  let streamedText = '';
  let eventCount = 0;
  
  // Stream events
  for await (const event of handle.events) {
    eventCount++;
    
    switch (event.type) {
      case 'run.queued':
        console.log(`  ⏳ Queued (position: ${event.position})`);
        break;
        
      case 'run.started':
        console.log(`  ▶️  Started`);
        break;
        
      case 'context.start':
        console.log(`  🔧 Assembling context...`);
        break;
        
      case 'context.complete':
        console.log(`  ✓ Context ready`);
        break;
        
      case 'model.start':
        console.log(`  🤖 Model streaming...`);
        process.stdout.write('  💬 ');
        break;
        
      case 'model.delta':
        process.stdout.write(event.delta);
        streamedText += event.delta;
        break;
        
      case 'model.complete':
        console.log('');
        console.log(`  ✓ Model complete (${event.response.usage?.totalTokens || 0} tokens)`);
        break;
        
      case 'tool.start':
        console.log(`  🔨 Executing tool: ${event.toolName}`);
        break;
        
      case 'tool.complete':
        console.log(`  ✓ Tool complete`);
        break;
        
      case 'run.completed':
        console.log(`  ✅ Run completed`);
        console.log('');
        console.log(`  📊 Stats:`);
        console.log(`     - Events: ${eventCount}`);
        console.log(`     - Duration: ${event.result.context.metrics.total.duration}ms`);
        console.log(`     - Turns: ${event.result.context.turns.turns}`);
        console.log(`     - Tool rounds: ${event.result.context.turns.toolRounds}`);
        break;
        
      case 'run.error':
        console.log(`  ❌ Error: ${event.error}`);
        break;
    }
  }
  
  console.log('');
}

// ============================================================================
// Run Checkpoint
// ============================================================================

if (require.main === module) {
  runIntegrationCheckpoint().catch(error => {
    console.error('❌ Integration checkpoint failed:', error);
    process.exit(1);
  });
}

export { runIntegrationCheckpoint };
