/**
 * Interactive Terminal Chat
 * 
 * Консольный чат с реальной моделью Ollama gpt-oss:20b
 * Использует те же модули что и Telegram бот
 */

import * as readline from 'readline';
import { AgentLoop } from './agent-loop';
import type { AgentLoopDependencies } from './agent-loop/types';
import { basicTools } from './tools/basic-tools';
import { SkillRegistry } from './skills/SkillRegistry';
import { SessionStore, RealFileSystem } from './session-store';
import { ContextAssembler } from './context-assembler';
import { ToolExecutor } from './tool-executor';
import * as fs from 'fs';

// ============================================================================
// Global Skill Registry
// ============================================================================

const skillRegistry = new SkillRegistry('./skills');

// ============================================================================
// Mock Dependencies - Simple In-Memory (работает с AgentLoop)
// ============================================================================

// SessionStore теперь реальный!
class SessionStoreAdapter {
  constructor(private store: SessionStore) {}
  
  async get(id: string): Promise<any> {
    try {
      const messages = await this.store.getMessages(id);
      return {
        id,
        messages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } catch (error) {
      return {
        id,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }
  }
  
  async append(id: string, messages: any[]): Promise<void> {
    // SessionStore.append принимает одно сообщение, не массив
    // append() автоматически создаст сессию если её нет
    for (const msg of messages) {
      await this.store.append(id, {
        type: msg.type || 'message',
        role: msg.role,
        content: msg.content,
        parentId: msg.parentId || null,
      });
    }
  }
}

class ContextAssemblerAdapter {
  constructor(
    private assembler: ContextAssembler,
    private sessionStore: SessionStoreAdapter
  ) {}
  
  async assemble({ sessionId, input }: any): Promise<any> {
    // Загрузить историю
    const session = await this.sessionStore.get(sessionId);
    const historyMessages = session?.messages || [];
    
    const formattedHistory = historyMessages.map((msg: any) => ({
      role: msg.role,
      content: typeof msg.content === 'string'
        ? [{ type: 'text', text: msg.content }]
        : msg.content,
    }));
    
    // Базовый prompt
    let basePrompt = 'Ты - умный AI-ассистент. Отвечай на русском языке, будь полезным и дружелюбным. У тебя есть инструменты (tools): calculator для вычислений, get_time для узнавания времени, get_weather для погоды, browser_navigate для открытия веб-страниц, browser_search для поиска в интернете.';
    
    // Добавить skills
    const systemPrompt = skillRegistry.buildSystemPromptWithSkills(basePrompt, input);
    
    return {
      systemPrompt,
      messages: [
        ...formattedHistory,
        {
          role: 'user',
          content: [{ type: 'text', text: input }],
        },
      ],
      tools: basicTools,
      model: 'gpt-oss:20b',
      parameters: {
        modelId: 'gpt-oss:20b',
        temperature: 0.7,
        maxTokens: 2000,
      },
      metadata: {
        tokens: { system: 50, messages: 20, tools: basicTools.length * 50, total: 70 + basicTools.length * 50 },
        counts: { messages: 1, tools: basicTools.length },
        truncated: false,
        compacted: false,
      },
    };
  }
}

class MockModelAdapter {
  async *stream({ messages, parameters }: any): AsyncIterable<any> {
    const userMessage = messages[messages.length - 1];
    const userText = userMessage.content?.[0]?.text || 'unknown';
    
    try {
      // Реальный запрос к Ollama
      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-oss:20b',
          messages: [
            {
              role: 'system',
              content: 'Ты - умный AI-ассистент. Отвечай на русском языке, будь полезным и дружелюбным.'
            },
            {
              role: 'user',
              content: userText
            }
          ],
          stream: true
        })
      });
      
      if (!response.ok) {
        throw new Error(`Ollama error: ${response.statusText}`);
      }
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }
      
      const decoder = new TextDecoder();
      let fullResponse = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.trim());
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              fullResponse += data.message.content;
              yield { type: 'content', delta: data.message.content };
            }
            
            if (data.done) {
              yield {
                type: 'response',
                id: 'resp-ollama-1',
                content: fullResponse,
                finishReason: 'stop',
                usage: {
                  promptTokens: 70,
                  completionTokens: fullResponse.split(' ').length,
                  totalTokens: 70 + fullResponse.split(' ').length,
                },
              };
              return;
            }
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }
    } catch (error: any) {
      // Fallback to mock response
      const fallbackResponse = `Извините, произошла ошибка подключения к Ollama: ${error.message}. Проверьте что Ollama запущен (ollama serve).`;
      
      yield { type: 'content', delta: fallbackResponse };
      yield {
        type: 'response',
        id: 'resp-error-1',
        content: fallbackResponse,
        finishReason: 'stop',
        usage: { promptTokens: 70, completionTokens: 20, totalTokens: 90 },
      };
    }
  }
}

class MockToolExecutor {
  async execute({ name, arguments: args }: any): Promise<any> {
    // Найти tool в списке
    const tool = basicTools.find(t => t.name === name);
    
    if (!tool) {
      return {
        output: { error: `Tool ${name} not found` },
        success: false,
      };
    }
    
    try {
      // Выполнить tool handler
      const result = await tool.handler(args);
      
      console.log(`  ${colors.yellow}🔨 Tool: ${name}${colors.reset}`);
      console.log(`  ${colors.dim}Result: ${JSON.stringify(result, null, 2)}${colors.reset}`);
      
      return {
        output: result,
        success: true,
      };
    } catch (error: any) {
      console.log(`  ${colors.red}❌ Tool error: ${error.message}${colors.reset}`);
      return {
        output: { error: error.message },
        success: false,
      };
    }
  }
}

// ============================================================================
// Colors
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('');
  console.log(`${colors.bright}${colors.cyan}╔════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║     CLONEBOT - Interactive Terminal       ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚════════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  console.log(`${colors.dim}Model: Ollama gpt-oss:20b${colors.reset}`);
  console.log(`${colors.dim}URL: http://localhost:11434${colors.reset}`);
  console.log('');
  
  // Load skills
  console.log(`${colors.yellow}📚 Loading skills...${colors.reset}`);
  await skillRegistry.loadAll();
  const stats = skillRegistry.getStats();
  console.log(`${colors.green}✓ Skills loaded: ${stats.total} skills, ${stats.categories.length} categories${colors.reset}`);
  console.log('');
  
  // Initialize SessionStore
  console.log(`${colors.yellow}✓ Initializing SessionStore...${colors.reset}`);
  const sessionsDir = './sessions';
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }
  const fileSystem = new RealFileSystem();
  const sessionStore = new SessionStore(fileSystem, {
    storageDir: sessionsDir,
  });
  await sessionStore.init(); // Initialize
  console.log(`${colors.green}✓ SessionStore initialized${colors.reset}`);
  console.log('');
  
  // Initialize ToolExecutor
  console.log(`${colors.yellow}✓ Initializing ToolExecutor...${colors.reset}`);
  const toolExecutor = new ToolExecutor();
  for (const tool of basicTools) {
    toolExecutor.register(
      {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema as any,
      },
      tool.handler as any
    );
  }
  console.log(`${colors.green}✓ ToolExecutor initialized${colors.reset}`);
  console.log('');
  
  // Initialize ContextAssembler
  console.log(`${colors.yellow}✓ Initializing ContextAssembler...${colors.reset}`);
  const contextAssembler = new ContextAssembler(
    {
      sessionStore: sessionStore as any,
      toolExecutor: toolExecutor as any,
    },
    {
      defaultModel: 'gpt-oss:20b',
      enableCaching: true,
    }
  );
  console.log(`${colors.green}✓ ContextAssembler initialized${colors.reset}`);
  console.log('');
  
  // Create dependencies
  const sessionStoreAdapter = new SessionStoreAdapter(sessionStore);
  
  const dependencies: AgentLoopDependencies = {
    sessionStore: sessionStoreAdapter as any,
    contextAssembler: new ContextAssemblerAdapter(contextAssembler, sessionStoreAdapter) as any,
    modelAdapter: new MockModelAdapter() as any,
    toolExecutor: new MockToolExecutor() as any,
  };
  
  // Initialize Agent Loop
  const agent = new AgentLoop(dependencies, {
    concurrency: {
      maxConcurrentRuns: 1,
      maxConcurrentToolCalls: 3,
    },
    limits: {
      maxTurns: 10,
      maxToolRounds: 5,
      maxToolCallsPerRound: 10,
      queueTimeout: 30000,
    },
  });
  
  console.log(`${colors.green}✓ Ready${colors.reset}`);
  console.log('');
  console.log(`${colors.dim}Type your message and press Enter${colors.reset}`);
  console.log(`${colors.dim}Type 'exit' or 'quit' to exit${colors.reset}`);
  console.log(`${colors.dim}Type 'clear' to clear history${colors.reset}`);
  console.log('');
  
  // Setup readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${colors.bright}${colors.blue}You>${colors.reset} `,
  });
  
  let messageCount = 0;
  const sessionId = 'terminal-session-' + Date.now();
  
  rl.prompt();
  
  rl.on('line', async (input: string) => {
    const trimmed = input.trim();
    
    // Handle commands
    if (trimmed === 'exit' || trimmed === 'quit') {
      console.log('');
      console.log(`${colors.dim}Goodbye!${colors.reset}`);
      process.exit(0);
    }
    
    if (trimmed === 'clear') {
      console.clear();
      console.log(`${colors.green}✓ History cleared${colors.reset}`);
      console.log('');
      rl.prompt();
      return;
    }
    
    if (!trimmed) {
      rl.prompt();
      return;
    }
    
    messageCount++;
    
    try {
      // Execute agent
      const handle = await agent.execute({
        message: trimmed,
        sessionId,
      });
      
      console.log('');
      console.log(`${colors.bright}${colors.magenta}Bot>${colors.reset} `, '');
      
      let accumulatedText = '';
      
      // Stream response
      for await (const event of handle.events) {
        switch (event.type) {
          case 'model.delta':
            process.stdout.write(event.delta);
            accumulatedText += event.delta;
            break;
            
          case 'model.complete':
            console.log('');
            break;
            
          case 'run.completed':
            console.log('');
            console.log(`${colors.dim}[${accumulatedText.length} chars]${colors.reset}`);
            break;
            
          case 'run.error':
            console.log('');
            console.log(`${colors.red}Error: ${event.error}${colors.reset}`);
            break;
        }
      }
      
      console.log('');
      rl.prompt();
      
    } catch (error: any) {
      console.log('');
      console.log(`${colors.red}Error: ${error.message}${colors.reset}`);
      console.log('');
      rl.prompt();
    }
  });
  
  rl.on('close', () => {
    console.log('');
    console.log(`${colors.dim}Goodbye!${colors.reset}`);
    process.exit(0);
  });
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('');
  console.log(`${colors.dim}Goodbye!${colors.reset}`);
  process.exit(0);
});

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
