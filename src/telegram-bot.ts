/**
 * Production Telegram Bot with Full Integration
 * 
 * Integrates all modules:
 * - Agent Loop (orchestrator)
 * - Skill Registry (dynamic capabilities)
 * - Browser Controller (web automation)
 * - All other core modules
 */

import { TelegramAdapter } from './telegram-adapter';
import { AgentLoop } from './agent-loop';
import { SessionStore } from './session-store';
import { ContextAssembler } from './context-assembler';
import { ModelAdapter } from './model-adapter';
import { ToolExecutor } from './tool-executor';
import { SkillRegistry } from './skill-registry';
import { AgentLoopIntegration } from './skill-registry/agent-loop-integration';
import { FileWatcher } from './skill-registry/file-watcher';
import type { AgentLoopDependencies } from './agent-loop/types';
import * as path from 'path';

// ============================================================================
// Configuration
// ============================================================================

interface BotConfig {
  telegram: {
    token: string;
    mode: 'polling' | 'webhook';
    webhook?: {
      url: string;
      port: number;
    };
  };
  model: {
    provider: string;
    apiKey: string;
    modelId: string;
  };
  skills: {
    enabled: boolean;
    directory: string;
    autoActivate: boolean;
    watchFiles: boolean;
  };
  browser: {
    enabled: boolean;
    headless: boolean;
  };
}

function getConfig(): BotConfig {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
  }
  
  if (!apiKey) {
    console.warn('⚠️  Warning: No API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY');
  }
  
  return {
    telegram: {
      token,
      mode: (process.env.TELEGRAM_MODE as 'polling' | 'webhook') || 'polling',
      webhook: process.env.TELEGRAM_WEBHOOK_URL ? {
        url: process.env.TELEGRAM_WEBHOOK_URL,
        port: parseInt(process.env.TELEGRAM_WEBHOOK_PORT || '3000', 10)
      } : undefined
    },
    model: {
      provider: process.env.MODEL_PROVIDER || 'openai',
      apiKey: apiKey || '',
      modelId: process.env.MODEL_ID || 'gpt-4'
    },
    skills: {
      enabled: process.env.SKILLS_ENABLED !== 'false',
      directory: process.env.SKILLS_DIR || path.join(process.cwd(), 'skills'),
      autoActivate: process.env.SKILLS_AUTO_ACTIVATE !== 'false',
      watchFiles: process.env.SKILLS_WATCH !== 'false'
    },
    browser: {
      enabled: process.env.BROWSER_ENABLED === 'true',
      headless: process.env.BROWSER_HEADLESS !== 'false'
    }
  };
}

// ============================================================================
// Main Bot
// ============================================================================

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  🤖 CLONEBOT - Production Telegram Bot');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  
  const config = getConfig();
  
  // Initialize Session Store
  console.log('✓ Initializing Session Store...');
  const sessionStore = new SessionStore({
    adapter: 'memory', // Can switch to 'sqlite' or 'redis'
    ttl: 24 * 60 * 60 * 1000, // 24 hours
  });
  console.log('✓ Session Store ready');
  
  // Initialize Tool Executor
  console.log('✓ Initializing Tool Executor...');
  const toolExecutor = new ToolExecutor({
    timeout: 30000,
    maxConcurrent: 5,
  });
  console.log('✓ Tool Executor ready');
  
  // Initialize Browser Tools (if enabled)
  if (config.browser.enabled) {
    console.log('✓ Initializing Browser Controller...');
    try {
      const { registerBrowserTools } = await import('./tool-executor/browser-tools');
      await registerBrowserTools(toolExecutor, {
        headless: config.browser.headless,
        timeout: 30000
      });
      console.log('✓ Browser Controller ready (tools registered)');
    } catch (error) {
      console.warn('⚠️  Browser Controller failed to initialize:', error);
    }
  }
  
  // Initialize Skill Registry (if enabled)
  let skillIntegration: AgentLoopIntegration | null = null;
  let fileWatcher: FileWatcher | null = null;
  
  if (config.skills.enabled) {
    console.log('✓ Initializing Skill Registry...');
    
    const registry = new SkillRegistry({
      maxActivations: 10,
      precedence: {
        order: ['explicit', 'priority', 'source', 'alphabetical'],
        weights: { explicit: 1000, priority: 100, source: 10, alphabetical: 1 }
      }
    });
    
    // Load skills from directory
    try {
      await registry.loadFromDirectory(config.skills.directory);
      const allSkills = registry.list();
      console.log(`✓ Loaded ${allSkills.length} skills from ${config.skills.directory}`);
      
      if (allSkills.length > 0) {
        console.log('  Skills:', allSkills.map(s => s.name).join(', '));
      }
    } catch (error) {
      console.warn('⚠️  No skills directory found or error loading skills');
    }
    
    // Setup Agent Loop integration
    skillIntegration = new AgentLoopIntegration(registry, {
      autoActivate: config.skills.autoActivate,
      autoActivateThreshold: 5,
      maxAutoActivate: 3,
      includeExamples: false,
      injectionMode: 'system'
    });
    
    console.log('✓ Skill Registry integrated with Agent Loop');
    
    // Setup file watcher for hot-reload
    if (config.skills.watchFiles) {
      fileWatcher = new FileWatcher(registry, {
        debounceMs: 1000,
        ignorePatterns: [/node_modules/, /\.git/]
      });
      
      await fileWatcher.watchDirectory(config.skills.directory);
      console.log('✓ File watcher monitoring skills directory');
    }
  }
  
  // Initialize Context Assembler
  console.log('✓ Initializing Context Assembler...');
  const contextAssembler = new ContextAssembler({
    sessionStore,
    toolExecutor,
    model: {
      provider: config.model.provider as any,
      modelId: config.model.modelId
    },
    defaultSystemPrompt: 'You are a helpful AI assistant integrated with Telegram.',
  });
  console.log('✓ Context Assembler ready');
  
  // Initialize Model Adapter
  console.log('✓ Initializing Model Adapter...');
  const modelAdapter = new ModelAdapter({
    provider: config.model.provider as any,
    apiKey: config.model.apiKey,
    defaultModel: config.model.modelId,
  });
  console.log('✓ Model Adapter ready');
  
  // Create Agent Loop dependencies
  const dependencies: AgentLoopDependencies = {
    sessionStore,
    contextAssembler,
    modelAdapter,
    toolExecutor,
  };
  
  // Initialize Agent Loop
  console.log('✓ Initializing Agent Loop...');
  const agent = new AgentLoop(dependencies, {
    concurrency: {
      maxConcurrentRuns: 10,
      maxConcurrentToolCalls: 5,
    },
    limits: {
      maxTurns: 20,
      maxToolRounds: 10,
      maxToolCallsPerRound: 10,
      queueTimeout: 60000,
    },
  });
  console.log('✓ Agent Loop ready');
  console.log('');
  
  // Initialize Telegram Adapter
  console.log('✓ Initializing Telegram Adapter...');
  const telegram = new TelegramAdapter({
    token: config.telegram.token,
    mode: config.telegram.mode,
    webhook: config.telegram.webhook,
    polling: config.telegram.mode === 'polling' ? {
      timeout: 30,
      allowedUpdates: ['message', 'callback_query'],
    } : undefined,
    dmPolicy: 'open',
    streaming: {
      enabled: true,
    },
    rateLimit: {
      messagesPerSecond: 30,
      messagesPerMinutePerGroup: 20,
    },
  });
  
  console.log('✓ Telegram Adapter ready');
  console.log('');
  
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ✅ All modules initialized');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('Configuration:');
  console.log(`  Mode: ${config.telegram.mode}`);
  console.log(`  Model: ${config.model.provider}/${config.model.modelId}`);
  console.log(`  Skills: ${config.skills.enabled ? 'enabled' : 'disabled'}`);
  console.log(`  Browser: ${config.browser.enabled ? 'enabled' : 'disabled'}`);
  console.log('');
  console.log('🚀 Bot is running and listening for messages...');
  console.log('');
  
  // Setup message handler
  telegram.on('message', async (message) => {
    const chatId = message.chatId;
    const userId = message.userId;
    const text = message.text || '';
    
    console.log(`📨 Message from ${userId} in chat ${chatId}: "${text}"`);
    
    try {
      const sessionKey = `telegram:${chatId}:${userId}`;
      
      // Process with Skill Registry if enabled
      if (skillIntegration) {
        const skillResult = await skillIntegration.processMessage(text, sessionKey);
        
        if (skillResult.activatedSkills.length > 0) {
          console.log(`  🎯 Activated skills: ${skillResult.activatedSkills.join(', ')}`);
        }
        
        if (skillResult.errors.length > 0) {
          console.warn('  ⚠️  Skill errors:', skillResult.errors);
        }
      }
      
      // Execute agent
      const handle = await agent.execute({
        message: text,
        sessionId: sessionKey,
      });
      
      console.log(`  🆔 Run: ${handle.runId}`);
      
      // Stream response
      let streamedText = '';
      let sentMessage: any = null;
      let lastEditTime = 0;
      const MIN_EDIT_INTERVAL = 500;
      
      for await (const event of handle.events) {
        if (event.type === 'model.delta') {
          streamedText += event.delta;
          
          const now = Date.now();
          if (!sentMessage) {
            // Send first chunk
            sentMessage = await telegram.sendMessage(chatId, streamedText);
            lastEditTime = now;
          } else if (now - lastEditTime >= MIN_EDIT_INTERVAL && streamedText.length > 0) {
            // Edit message with accumulated text
            try {
              await telegram.editMessage(chatId, sentMessage.message_id, streamedText);
              lastEditTime = now;
            } catch (error) {
              // Ignore rate limit errors
            }
          }
        }
        
        if (event.type === 'model.complete') {
          // Final edit with complete response
          const content = event.response?.content;
          if (sentMessage && content) {
            try {
              await telegram.editMessage(chatId, sentMessage.message_id, content);
            } catch (error) {
              // If edit fails, send as new message
              await telegram.sendMessage(chatId, content);
            }
          } else if (!sentMessage && content) {
            await telegram.sendMessage(chatId, content);
          }
          
          console.log(`  ✅ Response sent (${event.response?.usage?.totalTokens || 0} tokens)`);
        }
        
        if (event.type === 'run.error') {
          console.error('  ❌ Error:', event.error);
          await telegram.sendMessage(chatId, `❌ Error: ${event.error.message}`);
        }
      }
      
    } catch (error: any) {
      console.error('❌ Message processing error:', error);
      try {
        await telegram.sendMessage(chatId, `❌ Error: ${error.message}`);
      } catch {
        // Ignore
      }
    }
  });
  
  // Setup error handler
  telegram.on('error', (error) => {
    console.error('❌ Telegram error:', error);
  });
  
  // Start the bot
  await telegram.start();
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('');
    console.log('🛑 Shutting down...');
    
    if (fileWatcher) {
      await fileWatcher.stop();
    }
    
    await telegram.stop();
    await agent.shutdown();
    
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
