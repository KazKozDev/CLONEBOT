/**
 * Production Telegram Bot with Real Ollama Model
 * 
 * Использует все реальные модули:
 * - SessionStore (память)
 * - ContextAssembler (с real tools)
 * - ModelAdapter (Ollama gpt-oss:20b)
 * - ToolExecutor (с реальными tools)
 * - TelegramAdapter (polling/webhook)
 */

import { TelegramAdapter } from './telegram-adapter';
import { AgentLoop } from './agent-loop';
import { SessionStore } from './session-store';
import { ContextAssembler } from './context-assembler';
import { ModelAdapter } from './model-adapter';
import { ToolExecutor } from './tool-executor';
import type { AgentLoopDependencies } from './agent-loop/types';
import type { FileSystem } from './session-store/types';

// ============================================================================
// Adapters for AgentLoop
// ============================================================================

/**
 * SessionStore Adapter - оборачивает реальный SessionStore
 */
class SessionStoreAdapter {
  constructor(private store: SessionStore) {}
  
  async get(id: string): Promise<any> {
    return this.store.get(id);
  }
  
  async append(id: string, messages: any[]): Promise<void> {
    await this.store.append(id, messages);
    console.log(`📝 Session ${id}: ${messages.length} messages appended`);
  }
}

/**
 * ContextAssembler Adapter
 */
class ContextAssemblerAdapter {
  constructor(private assembler: ContextAssembler) {}
  
  async assemble(request: { sessionId: string; input: string; options?: any }): Promise<any> {
    console.log(`🔧 Context assembled for session ${request.sessionId}`);
    return this.assembler.assemble(request);
  }
}

/**
 * ModelAdapter Adapter
 */
class ModelAdapterAdapter {
  constructor(private adapter: ModelAdapter) {}
  
  async *stream(request: any): AsyncIterable<any> {
    console.log(`🤖 Model streaming...`);
    yield* this.adapter.stream(request);
  }
}

/**
 * ToolExecutor Adapter
 */
class ToolExecutorAdapter {
  constructor(private executor: ToolExecutor) {}
  
  async execute(request: { name: string; arguments: any; signal?: AbortSignal }): Promise<{ output: any; success: boolean }> {
    console.log(`🔨 Tool executing: ${request.name}`);
    return this.executor.execute(request);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  🚀 PRODUCTION TELEGRAM BOT');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  
  // Check for bot token
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken) {
    console.log('❌ ERROR: TELEGRAM_BOT_TOKEN not set');
    console.log('');
    console.log('Usage:');
    console.log('  export TELEGRAM_BOT_TOKEN="your_token_here"');
    console.log('  npm start');
    console.log('');
    process.exit(1);
  }
  
  // Create real instances
  console.log('✓ Initializing Session Store...');
  const fs: FileSystem = {
    async read(path: string): Promise<string> {
      const fsModule = await import('fs/promises');
      return fsModule.readFile(path, 'utf-8');
    },
    async write(path: string, data: string): Promise<void> {
      const fsModule = await import('fs/promises');
      await fsModule.writeFile(path, data, 'utf-8');
    },
    async exists(path: string): Promise<boolean> {
      const fsModule = await import('fs/promises');
      try {
        await fsModule.access(path);
        return true;
      } catch {
        return false;
      }
    },
    async list(path: string): Promise<string[]> {
      const fsModule = await import('fs/promises');
      return fsModule.readdir(path);
    },
    async mkdir(path: string): Promise<void> {
      const fsModule = await import('fs/promises');
      await fsModule.mkdir(path, { recursive: true });
    },
    async delete(path: string): Promise<void> {
      const fsModule = await import('fs/promises');
      await fsModule.unlink(path);
    }
  };
  
  const sessionStore = new SessionStore(fs, {
    basePath: '.sessions',
    ttl: 24 * 60 * 60 * 1000, // 24 hours
  });
  
  console.log('✓ Initializing Tool Executor...');
  const toolExecutor = new ToolExecutor();
  
  console.log('✓ Initializing Context Assembler...');
  const contextAssembler = new ContextAssembler({
    sessionStore,
    toolExecutor,
  });
  
  console.log('✓ Initializing Model Adapter (Ollama gpt-oss:20b)...');
  const modelAdapter = new ModelAdapter();
  
  // Initialize with Ollama credentials
  await modelAdapter.initialize({
    programmatic: {
      ollama: {
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      },
    },
  });
  
  // Test model availability
  try {
    const modelInfo = modelAdapter.getModelInfo('gpt-oss:20b');
    if (modelInfo) {
      console.log(`✓ Model ready: ${modelInfo.displayName}`);
      console.log(`  Context: ${modelInfo.capabilities.contextWindow.toLocaleString()} tokens`);
    }
  } catch (error: any) {
    console.warn(`⚠️  Model info not available: ${error.message}`);
  }
  
  // Create adapted dependencies
  const dependencies: AgentLoopDependencies = {
    sessionStore: new SessionStoreAdapter(sessionStore),
    contextAssembler: new ContextAssemblerAdapter(contextAssembler),
    modelAdapter: new ModelAdapterAdapter(modelAdapter),
    toolExecutor: new ToolExecutorAdapter(toolExecutor),
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
  
  // Initialize Telegram Adapter
  console.log('✓ Initializing Telegram Adapter...');
  const telegram = new TelegramAdapter({
    token: botToken,
    mode: 'polling',
    polling: {
      timeout: 30,
      allowedUpdates: ['message', 'callback_query'],
    },
    dmPolicy: 'open',
    streaming: {
      enabled: true,
    },
    rateLimit: {
      messagesPerSecond: 25,
      messagesPerMinutePerGroup: 18,
    },
  });
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ✅ TELEGRAM BOT READY!');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('🤖 Using Ollama gpt-oss:20b');
  console.log('📨 Waiting for messages...');
  console.log('');
  console.log('Нажмите Ctrl+C для остановки');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  
  // Message counter
  let messageCount = 0;
  
  // Setup message handler
  telegram.on('message', async (message) => {
    messageCount++;
    
    const chatId = message.chatId;
    const userId = message.userId;
    const text = message.text || '';
    const sessionId = `telegram:${userId}:${chatId}`;
    
    console.log('');
    console.log('───────────────────────────────────────────────────────');
    console.log(`📨 MESSAGE #${messageCount}`);
    console.log('───────────────────────────────────────────────────────');
    console.log(`User: ${userId}`);
    console.log(`Chat: ${chatId}`);
    console.log(`Text: "${text}"`);
    console.log(`Session: ${sessionId}`);
    console.log('');
    
    // Handle commands
    if (text.startsWith('/')) {
      const command = text.split(' ')[0].slice(1);
      
      if (command === 'start') {
        console.log('📋 Command: /start');
        await telegram.sendMessage(
          chatId,
          '👋 Привет! Я CLONEBOT с реальной моделью Ollama gpt-oss:20b.\n\n' +
          'Все модули активны:\n' +
          '✅ Session Store\n' +
          '✅ Context Assembler\n' +
          '✅ Model Adapter (Ollama)\n' +
          '✅ Tool Executor\n' +
          '✅ Agent Loop\n\n' +
          'Задавайте любые вопросы!'
        );
        return;
      }
    }
    
    try {
      console.log('🤖 Executing Agent Loop...');
      console.log('');
      
      // Execute agent loop
      const stream = agent.run({
        sessionId,
        input: text,
        config: {
          modelId: 'gpt-oss:20b',
          systemPrompt: 'Ты - умный AI-ассистент в Telegram. Отвечай на русском языке, будь полезным и дружелюбным.',
        },
      });
      
      let currentMessageId: number | null = null;
      let accumulatedText = '';
      let lastEditTime = 0;
      const EDIT_INTERVAL = 300; // Edit every 300ms
      
      // Process stream
      for await (const event of stream) {
        if (event.type === 'content') {
          accumulatedText += event.delta;
          
          const now = Date.now();
          if (now - lastEditTime >= EDIT_INTERVAL) {
            if (!currentMessageId) {
              // Send initial message
              const sent = await telegram.sendMessage(chatId, accumulatedText || '...');
              currentMessageId = sent.messageId;
              console.log(`  💬 Initial message sent (ID: ${currentMessageId})`);
            } else {
              // Edit existing message
              await telegram.editMessage(chatId, currentMessageId, accumulatedText);
            }
            lastEditTime = now;
          }
        } else if (event.type === 'complete') {
          // Final edit with complete response
          if (currentMessageId && accumulatedText) {
            await telegram.editMessage(chatId, currentMessageId, accumulatedText);
            console.log(`  ✓ Final message edit sent`);
          } else if (!currentMessageId && accumulatedText) {
            await telegram.sendMessage(chatId, accumulatedText);
            console.log(`  ✓ Final message sent`);
          }
          
          console.log('  ✅ Agent completed');
          console.log('');
          console.log('  📊 Stats:');
          console.log(`     - Duration: ${event.stats.duration}ms`);
          console.log(`     - Turns: ${event.stats.turns}`);
          console.log(`     - Final response: ${accumulatedText.length} chars`);
          console.log('');
        } else if (event.type === 'error') {
          console.log(`  ❌ Error: ${typeof event.error === 'string' ? event.error : event.error?.message || 'Unknown error'}`);
          
          if (currentMessageId) {
            await telegram.editMessage(chatId, currentMessageId, '❌ Произошла ошибка при обработке запроса.');
          } else {
            await telegram.sendMessage(chatId, '❌ Произошла ошибка при обработке запроса.');
          }
        }
      }
      
      console.log('✅ Message processed successfully!');
      console.log('');
      
    } catch (error: any) {
      console.error('❌ Error processing message:', error);
      await telegram.sendMessage(chatId, '❌ Ошибка обработки сообщения.');
    }
  });
  
  // Setup error handler
  telegram.on('error', (error) => {
    console.error('❌ Telegram error:', error);
  });
  
  // Start the adapter
  console.log('Starting Telegram Adapter...');
  await telegram.start();
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  ⏹️  Stopping Bot...');
    console.log('═══════════════════════════════════════════════════════');
    await telegram.stop();
    process.exit(0);
  });
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
