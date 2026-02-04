/**
 * Gateway Bot - Telegram + Web UI Integration
 *
 * Runs both Telegram bot and Gateway Server simultaneously
 * Provides web interface for monitoring and interaction
 */

import { TelegramAdapter } from './telegram-adapter';
import { GatewayServer } from './gateway-server';
import { AgentLoop } from './agent-loop';
import { SessionStore, InMemoryFileSystem, RealFileSystem } from './session-store';
import { ContextAssembler } from './context-assembler';
import { ModelAdapter } from './model-adapter';
import { ToolExecutor } from './tool-executor';
import { SkillRegistry, ClawHubClient } from './skill-registry';
import { AgentLoopIntegration } from './skill-registry/agent-loop-integration';
import { MessageBus } from './message-bus';
import { MemoryStore } from './memory-store';
import { UserProfileStore } from './user-profile';
import { createForRun } from './block-streamer/agent-loop-integration';
import type { Block } from './block-streamer';
import type { AgentLoopDependencies } from './agent-loop/types';
import { Scheduler, createCleanupSessionsTask } from './scheduler';
import { RateLimiter, RateLimitPresets, AuditLogger } from './security';
// Side-effect import: registers agent.* event types on EventPayloadMap
import './agent-loop/bus-events';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Configuration
// ============================================================================

interface GatewayBotConfig {
  telegram: {
    enabled: boolean;
    token?: string;
    mode: 'polling' | 'webhook';
  };
  gateway: {
    host: string;
    port: number;
  };
  model: {
    provider: string;
    apiKey: string;
    modelId: string;
  };
  skills: {
    enabled: boolean;
    directory: string;
  };
  browser: {
    enabled: boolean;
  };
}

function getConfig(): GatewayBotConfig {
  const telegramEnabled = process.env.TELEGRAM_ENABLED !== 'false';
  const token = process.env.TELEGRAM_BOT_TOKEN;

  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  const provider =
    process.env.MODEL_PROVIDER ||
    (openaiKey ? 'openai' : anthropicKey ? 'anthropic' : 'ollama');

  const apiKey = provider === 'openai' ? openaiKey : provider === 'anthropic' ? anthropicKey : undefined;

  const defaultModelId = provider === 'ollama' ? 'gpt-oss:20b' : provider === 'anthropic' ? 'claude-sonnet-4-5-20251124' : 'gpt-4';

  if (telegramEnabled && !token) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is required (or set TELEGRAM_ENABLED=false to run gateway only)');
  }

  return {
    telegram: {
      enabled: telegramEnabled,
      token,
      mode: (process.env.TELEGRAM_MODE as 'polling' | 'webhook') || 'polling',
    },
    gateway: {
      host: process.env.GATEWAY_HOST || '127.0.0.1',
      port: parseInt(process.env.GATEWAY_PORT || '3000', 10),
    },
    model: {
      provider,
      apiKey: apiKey || '',
      modelId: process.env.MODEL_ID || defaultModelId,
    },
    skills: {
      enabled: process.env.SKILLS_ENABLED !== 'false',
      directory: process.env.SKILLS_DIR || path.join(process.cwd(), 'skills'),
    },
    browser: {
      enabled: process.env.BROWSER_ENABLED !== 'false', // enabled by default
    }
  };
}

// ============================================================================
// Shared Message Handler
// ============================================================================

async function handleMessage(
  agent: AgentLoop,
  skillIntegration: AgentLoopIntegration | null,
  telegram: TelegramAdapter,
  text: string,
  sessionKey: string,
  chatId: number,
  bus?: MessageBus
): Promise<void> {
  console.log(`📨 Processing: "${text}" (session: ${sessionKey})`);

  try {
    // Process with Skill Registry if enabled
    if (skillIntegration) {
      const skillResult = await skillIntegration.processMessage(text, sessionKey);

      if (skillResult.activatedSkills.length > 0) {
        console.log(`  🎯 Activated skills: ${skillResult.activatedSkills.join(', ')}`);
      }
    }

    // Execute agent
    const handle = await agent.execute({
      message: text,
      sessionId: sessionKey,
    });

    console.log(`  🆔 Run: ${handle.runId}`);

    // Use BlockStreamer for Telegram-optimized output
    let sentMessage: any = null;
    let lastEditTime = 0;
    const MIN_EDIT_INTERVAL = 500;
    let latestContent = '';

    const streamer = createForRun(handle.runId, 'telegram', (block: Block) => {
      latestContent += block.content;
      const now = Date.now();

      if (!sentMessage) {
        // Fire-and-forget first message send
        telegram.sendMessage(chatId, latestContent).then(msg => {
          sentMessage = msg;
          lastEditTime = Date.now();
        }).catch(() => {});
      } else if (now - lastEditTime >= MIN_EDIT_INTERVAL) {
        telegram.editMessage(chatId, sentMessage.message_id, latestContent).then(() => {
          lastEditTime = Date.now();
        }).catch(() => {});
      }
    });

    // Stream events — feed BlockStreamer + emit to MessageBus
    for await (const event of handle.events) {
      // Relay event to MessageBus (fire-and-forget)
      if (bus) {
        const { type, ...payload } = event as any;
        bus.emit(`agent.${type}`, payload).catch(() => {});
      }

      if (event.type === 'model.delta') {
        streamer.push(event.delta);
      }

      if (event.type === 'model.complete') {
        streamer.complete();

        // Final edit with complete content from model
        const content = event.response?.content;
        if (sentMessage && content) {
          try {
            await telegram.editMessage(chatId, sentMessage.message_id, content);
          } catch {
            await telegram.sendMessage(chatId, content);
          }
        } else if (!sentMessage && content) {
          await telegram.sendMessage(chatId, content);
        }

        console.log(`  ✅ Response sent (${event.response?.usage?.totalTokens || 0} tokens)`);
      }

      if (event.type === 'run.error') {
        streamer.abort();
        console.error('  ❌ Error:', event.error);
        const errorMsg = typeof event.error === 'string' ? event.error : String(event.error);
        await telegram.sendMessage(chatId, `❌ Error: ${errorMsg}`);
      }
    }
  } catch (error: any) {
    console.error('❌ Message processing error:', error);
    await telegram.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  🌐 CLONEBOT - Telegram + Gateway Server');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  const config = getConfig();

  // Initialize MessageBus
  const bus = new MessageBus();
  bus.use(async (event, _payload, next) => {
    if (event.startsWith('agent.')) {
      console.log(`  [bus] ${event}`);
    }
    await next();
  });
  console.log('✓ MessageBus initialized');

  // Initialize shared modules
  console.log('✓ Initializing shared modules...');

  const sessionStore = new SessionStore(new InMemoryFileSystem(), {
    lockTimeoutMs: 5000,
  });

  // Initialize Memory Store
  const workspaceDir = path.join(os.homedir(), '.openclone', 'workspace');
  const memoryStore = new MemoryStore(
    {
      workspaceDir,
      autoLoad: true
    },
    process.env.MEMORY_MASTER_PASSWORD || 'default-change-me'
  );
  
  try {
    const initResult = await memoryStore.init();
    console.log(`✓ Memory Store initialized (${initResult.promptsLoaded} prompts, ${initResult.skillsLoaded} skills)`);
    
    // Load credentials from Memory Store
    const telegramToken = memoryStore.getCredential('telegram_token');
    const openaiKey = memoryStore.getCredential('openai_key');
    const anthropicKey = memoryStore.getCredential('anthropic_key');
    
    if (telegramToken && config.telegram.enabled && !config.telegram.token) {
      config.telegram.token = telegramToken;
      console.log('  → Loaded Telegram token from Memory Store');
    }
    if (openaiKey && config.model.provider === 'openai' && !config.model.apiKey) {
      config.model.apiKey = openaiKey;
      console.log('  → Loaded OpenAI API key from Memory Store');
    }
    if (anthropicKey && config.model.provider === 'anthropic' && !config.model.apiKey) {
      config.model.apiKey = anthropicKey;
      console.log('  → Loaded Anthropic API key from Memory Store');
    }
  } catch (error) {
    console.warn('⚠️  Memory Store initialization failed:', error);
    console.warn('  → Continuing without Memory Store');
  }

  // Initialize User Profile Store
  const profilesDir = path.join(workspaceDir, 'users');
  const userProfileStore = new UserProfileStore({
    profilesDir,
    autoSave: true,
  });
  
  try {
    await userProfileStore.init();
    console.log('✓ User Profile Store initialized');
  } catch (error) {
    console.error('⚠️  User Profile Store initialization failed:', error);
  }

  // Initialize Security
  const rateLimiter = new RateLimiter({
    ...RateLimitPresets.moderate,
    keyGenerator: (ctx) => ctx.sessionId || ctx.userId || 'anonymous',
  });

  const auditLogger = new AuditLogger({
    logDir: path.join(process.cwd(), 'logs', 'audit'),
    retention: 30,
  });
  await auditLogger.init();
  console.log('✓ Security modules initialized (Rate Limiting, Audit Log)');

  // Initialize Scheduler
  const scheduler = new Scheduler();
  
  // Register cleanup task (runs daily)
  scheduler.registerTask({
    id: 'cleanup-sessions',
    name: 'Cleanup Old Sessions',
    interval: 'daily',
    enabled: true,
    handler: createCleanupSessionsTask({
      sessionsDir: path.join(process.cwd(), 'sessions'),
      maxAgeInDays: 7,
      dryRun: false,
    }),
  });

  // Register audit cleanup task
  scheduler.registerTask({
    id: 'cleanup-audit-logs',
    name: 'Cleanup Old Audit Logs',
    interval: 'daily',
    enabled: true,
    handler: async () => {
      await auditLogger.cleanup();
    },
  });

  scheduler.start();
  console.log('✓ Scheduler started (cleanup runs daily)');

  const toolExecutor = new ToolExecutor({
    defaultTimeout: 30000,
    maxConcurrent: 5,
  });

  // Enable security features
  toolExecutor.enableRateLimiting(rateLimiter);
  toolExecutor.enableAudit(auditLogger);

  // Basic Tools & Session Tools & ClawHub Tools
  try {
    const { basicTools, createSessionTools, createClawHubTools } = await import('./tools');
    
    // Register Basic Tools
    for (const tool of basicTools) {
      toolExecutor.register(
        { 
          name: tool.name, 
          description: tool.description, 
          parameters: tool.inputSchema as any 
        }, 
        tool.handler as any
      );
    }
    
    // Register Session Tools
    const sessionTools = createSessionTools(sessionStore, bus);
    for (const tool of sessionTools) {
      toolExecutor.register(
        { 
          name: tool.name, 
          description: tool.description, 
          parameters: tool.inputSchema as any 
        }, 
        tool.handler as any
      );
    }

    // Register ClawHub Tools
    let clawHubCount = 0;
    if (config.skills.enabled) {
      const clawHubClient = new ClawHubClient();
      const clawHubTools = createClawHubTools(clawHubClient, config.skills.directory);
      for (const tool of clawHubTools) {
        toolExecutor.register(
          { 
            name: tool.name, 
            description: tool.description, 
            parameters: tool.inputSchema as any 
          }, 
          tool.handler as any
        );
      }
      clawHubCount = clawHubTools.length;
    }

    console.log(`✓ Core tools registered (Basic: ${basicTools.length}, Session: ${sessionTools.length}, ClawHub: ${clawHubCount})`);
  } catch (error) {
    console.warn('⚠️  Failed to register core tools:', error);
  }

  // Browser tools
  if (config.browser.enabled) {
    try {
      const { registerBrowserTools } = await import('./tool-executor/browser-tools');
      registerBrowserTools(toolExecutor, {
        mode: 'openclaw',
        openclaw: { headless: true },
        timeouts: { navigation: 30000, action: 30000, idle: 30000 },
      });
      console.log('✓ Browser tools registered');
    } catch (error) {
      console.warn('⚠️  Browser tools failed:', error);
    }
  }

  // User Profile tools
  try {
    const { registerProfileTools } = await import('./user-profile/profile-tools');
    registerProfileTools(toolExecutor, userProfileStore);
    console.log('✓ User Profile tools registered (remember, recall, forget)');
  } catch (error) {
    console.warn('⚠️  User Profile tools failed:', error);
  }

  // Skill Registry
  let skillIntegration: AgentLoopIntegration | null = null;

  if (config.skills.enabled) {
    const registry = new SkillRegistry({
      workspaceDir: config.skills.directory,
    });

    try {
      const result = await registry.initialize();
      console.log(`✓ Loaded ${result.loaded} skills`);
    } catch {
      console.warn('⚠️  No skills found');
    }

    skillIntegration = new AgentLoopIntegration(registry, {
      autoActivate: true,
      autoActivateThreshold: 5,
      maxAutoActivate: 3,
    });

    console.log('✓ Skill Registry ready');
  }

  const contextAssembler = new ContextAssembler({
    sessionStore,
    toolExecutor,
    memoryStore,
    userProfileStore, // Add user profile
  });

  const modelAdapter = new ModelAdapter({
    defaultProvider: config.model.provider,
    defaultModel: config.model.modelId,
    providers: {
      ...(config.model.provider === 'ollama'
        ? {
            ollama: {
              baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
              defaultModel: config.model.modelId,
            },
          }
        : {}),
      ...(config.model.provider === 'openai'
        ? {
            openai: {
              apiKey: config.model.apiKey,
              defaultModel: config.model.modelId,
            },
          }
        : {}),
      ...(config.model.provider === 'anthropic'
        ? {
            anthropic: {
              apiKey: config.model.apiKey,
              defaultModel: config.model.modelId,
            },
          }
        : {}),
      ...(config.model.provider === 'google'
        ? {
            google: {
              apiKey: config.model.apiKey,
              defaultModel: config.model.modelId,
            },
          }
        : {}),
    },
  });

  const dependencies: AgentLoopDependencies = {
    sessionStore,
    contextAssembler,
    modelAdapter,
    toolExecutor,
    memoryStore,
  };

  const agent = new AgentLoop(dependencies, {
    concurrency: {
      maxConcurrentRuns: 20,
      maxConcurrentToolCalls: 10,
    },
    limits: {
      maxTurns: 20,
      maxToolRounds: 10,
      maxToolCallsPerRound: 10,
      queueTimeout: 60000,
    },
  });

  console.log('✓ Core modules initialized');
  console.log('');

  // RPC Handler
  bus.on('input:message', async (payload: any) => {
      const { sessionId, content } = payload as { sessionId: string; content: string };
      if (!sessionId || !content) return;
      
      console.log(`📨 RPC Message received for session ${sessionId}`);
      
      try {
        await agent.execute({
            sessionId,
            message: content,
            contextOptions: { source: 'rpc' }
        });
      } catch (error) {
        console.error(`❌ RPC Execution failed:`, error);
      }
  });

  // Initialize Gateway Server
  console.log('✓ Initializing Gateway Server...');

  const gateway = new GatewayServer(
    {
      host: config.gateway.host,
      port: config.gateway.port,
      auth: { mode: 'none' },
      cors: {
        enabled: true,
        origins: ['*'],
        credentials: true,
      },
      rateLimit: {
        enabled: false,
        defaultLimit: 60,
        windowMs: 60_000,
      },
      static: {
        enabled: true,
        root: path.join(process.cwd(), 'src', 'web', 'static'),
        index: 'index.html',
      },
      timeouts: {
        request: 30_000,
        websocket: 60_000,
        shutdown: 10_000,
      },
      limits: {
        maxBodySize: 10 * 1024 * 1024,
        maxConnections: 1000,
        maxConnectionsPerIp: 100,
      },
      logging: {
        requests: true,
        responses: false,
        errors: true,
      },
    },
    {
      agentLoop: agent,
      sessionStore,
      toolExecutor,
      messageBus: bus,
    }
  );

  await gateway.start();
  const address = gateway.getAddress();
  if (address) {
    console.log(`✓ Gateway Server running at http://${address.host}:${address.port}`);
  }
  console.log('');

  // Initialize Telegram Adapter (optional)
  let telegram: TelegramAdapter | null = null;
  if (config.telegram.enabled) {
    console.log('✓ Initializing Telegram Adapter...');

    telegram = new TelegramAdapter({
      token: config.telegram.token!,
      mode: config.telegram.mode,
      dmPolicy: 'open',
      streaming: { enabled: true },
    });

    // Setup message handler
    telegram.on('message', async (message) => {
      const sessionKey = `telegram:${message.chatId}:${message.userId}`;
      await handleMessage(
        agent,
        skillIntegration,
        telegram!,
        message.text || '',
        sessionKey,
        Number(message.chatId),
        bus
      );
    });

    telegram.on('error', (error) => {
      console.error('❌ Telegram error:', error);
    });

    await telegram.start();
    console.log('✓ Telegram Adapter ready');
    console.log('');
  } else {
    console.log('⚠️  Telegram disabled (set TELEGRAM_ENABLED=true + TELEGRAM_BOT_TOKEN to enable)');
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('  ✅ All systems operational');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  if (telegram) {
    console.log('🤖 Telegram bot is running');
  }
  if (address) {
    console.log(`🌐 Web UI: http://${address.host}:${address.port}`);
  }
  console.log('');
  console.log('Configuration:');
  console.log(`  Telegram: ${config.telegram.mode} mode`);
  if (address) {
    console.log(`  Gateway: ${address.host}:${address.port}`);
  }
  console.log(`  Model: ${config.model.provider}/${config.model.modelId}`);
  console.log(`  Skills: ${config.skills.enabled ? 'enabled' : 'disabled'}`);
  console.log(`  Browser: ${config.browser.enabled ? 'enabled' : 'disabled'}`);
  console.log('');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('');
    console.log('🛑 Shutting down...');

    scheduler.stop();
    await auditLogger.close();
    rateLimiter.destroy();

    if (telegram) {
      await telegram.stop();
    }
    await gateway.stop();

    console.log('✅ Shutdown complete');
    process.exit(0);
  });
}

// ============================================================================
// Entry Point
// ============================================================================

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
