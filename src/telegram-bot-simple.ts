/**
 * Production Telegram Bot
 * 
 * Полная интеграция всех модулей с реальными провайдерами
 * Поддержка: OpenAI, Anthropic, Google, Ollama (local)
 */

import { TelegramAdapter } from './telegram-adapter';
import { AgentLoop } from './agent-loop';
import { SessionStore, RealFileSystem } from './session-store';
import { ContextAssembler } from './context-assembler';
import { ModelAdapter } from './model-adapter';
import { ToolExecutor } from './tool-executor';
import { SkillRegistry } from './skill-registry';
import { AgentLoopIntegration } from './skill-registry/agent-loop-integration';
import { FileWatcher } from './skill-registry/file-watcher';
import type { AgentLoopDependencies } from './agent-loop/types';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// Configuration
// ============================================================================

const config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    mode: (process.env.TELEGRAM_MODE || 'polling') as 'polling' | 'webhook',
  },
  model: {
    // Provider: ollama (local), openai, anthropic, google
    provider: process.env.MODEL_PROVIDER || 'ollama',
    
    // Model ID (full format: provider/model)
    // Ollama: gpt-oss:20b, llama3.3:70b, qwen2.5:72b, mixtral:8x7b, etc.
    modelId: process.env.MODEL_ID || 'gpt-oss:20b',
    
    // API Keys (не нужны для Ollama)
    openaiKey: process.env.OPENAI_API_KEY,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    googleKey: process.env.GOOGLE_API_KEY,
    
    // Ollama settings
    ollamaUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  },
  skills: {
    enabled: process.env.SKILLS_ENABLED !== 'false',
    directory: process.env.SKILLS_DIR || path.join(process.cwd(), 'skills'),
    autoActivate: process.env.SKILLS_AUTO_ACTIVATE !== 'false',
    watchFiles: process.env.SKILLS_WATCH !== 'false',
  },
  browser: {
    enabled: process.env.BROWSER_ENABLED === 'true',
  }
};

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  🤖 CLONEBOT Production Bot');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  
  // Validate Telegram token
  if (!config.telegram.token) {
    console.error('❌ TELEGRAM_BOT_TOKEN not set');
    console.error('');
    console.error('Usage:');
    console.error('  export TELEGRAM_BOT_TOKEN="your_token_here"');
    console.error('  npm start');
    console.error('');
    process.exit(1);
  }
  
  // Show configuration
  console.log('Configuration:');
  console.log(`  Provider: ${config.model.provider}`);
  console.log(`  Model: ${config.model.modelId}`);
  
  if (config.model.provider === 'ollama') {
    console.log(`  Ollama URL: ${config.model.ollamaUrl}`);
  }
  
  console.log(`  Skills: ${config.skills.enabled ? 'enabled' : 'disabled'}`);
  console.log(`  Browser: ${config.browser.enabled ? 'enabled' : 'disabled'}`);
  console.log('');
  
  // Initialize Session Store
  console.log('✓ Initializing Session Store...');
  const sessionStore = new SessionStore(new RealFileSystem(), {
    storageDir: './sessions',
  });
  await sessionStore.init();
  
  // Initialize Tool Executor
  console.log('✓ Initializing Tool Executor...');
  const toolExecutor = new ToolExecutor();
  
  let browserCleanup: (() => Promise<void>) | undefined;

  // Browser tools (if enabled)
  if (config.browser.enabled) {
    try {
      const { registerBrowserTools } = await import('./tool-executor/browser-tools');
      const { cleanup } = registerBrowserTools(toolExecutor, {
        mode: 'openclaw',
        openclaw: { 
          headless: process.env.BROWSER_HEADLESS !== 'false' 
        }
      });
      browserCleanup = cleanup;
      console.log('✓ Browser tools registered');
    } catch (error: any) {
      console.warn(`⚠️  Browser tools failed: ${error.message}`);
    }
  }
  
  // Initialize Skill Registry (if enabled)
  let skillIntegration: AgentLoopIntegration | null = null;
  let fileWatcher: FileWatcher | null = null;
  
  if (config.skills.enabled) {
    console.log('✓ Initializing Skill Registry...');
    
    const registry = new SkillRegistry({
      workspaceDir: config.skills.directory,
    });

    if (!fs.existsSync(config.skills.directory)) {
      console.log(`  Creating skills directory: ${config.skills.directory}`);
      fs.mkdirSync(config.skills.directory, { recursive: true });
    }

    try {
      const result = await registry.initialize();
      const allSkills = registry.list();
      console.log(`✓ Loaded ${result.loaded} skills`);
      if (allSkills.length > 0) {
        console.log(`  Skills: ${allSkills.map(s => s.name).join(', ')}`);
      }
    } catch (error: any) {
      console.warn(`⚠️  Error loading skills: ${error.message}`);
    }
    
    // Setup Agent Loop integration
    skillIntegration = new AgentLoopIntegration(registry, {
      autoActivate: config.skills.autoActivate,
      autoActivateThreshold: 5,
      maxAutoActivate: 3,
      includeExamples: false,
      injectionMode: 'system',
    });
    
    // Setup file watcher for hot-reload
    if (config.skills.watchFiles) {
      console.warn('⚠️  File watcher is not configured in telegram-bot-simple');
    }
  }
  
  // Initialize Context Assembler
  console.log('✓ Initializing Context Assembler...');
  const contextAssembler = new ContextAssembler({
    sessionStore,
    toolExecutor,
  });
  
  // Initialize Model Adapter
  console.log('✓ Initializing Model Adapter...');
  const modelAdapter = new ModelAdapter();
  
  // Configure credentials
  await modelAdapter.initialize({
    programmatic: {
      openai: config.model.openaiKey ? { apiKey: config.model.openaiKey } : undefined,
      anthropic: config.model.anthropicKey ? { apiKey: config.model.anthropicKey } : undefined,
      google: config.model.googleKey ? { apiKey: config.model.googleKey } : undefined,
      ollama: { baseUrl: config.model.ollamaUrl },
    }
  });
  
  // Test model availability
  try {
    const modelInfo = modelAdapter.getModelInfo(config.model.modelId);
    if (modelInfo) {
      console.log(`✓ Model ready: ${modelInfo.displayName}`);
      console.log(`  Context: ${modelInfo.capabilities.contextWindow.toLocaleString()} tokens`);
      console.log(`  Tools: ${modelInfo.capabilities.supportsTools ? 'yes' : 'no'}`);
    }
  } catch (error: any) {
    console.warn(`⚠️  Could not get model info: ${error.message}`);
  }
  
  // Create Agent Loop dependencies
  const dependencies: AgentLoopDependencies = {
    sessionStore,
    contextAssembler,
    modelAdapter,
    toolExecutor,
  };
  
  // Initialize Agent Loop
  console.log('✓ Initializing Agent Loop...');
  const agent = new AgentLoop(dependencies);
  
  // Initialize Telegram Adapter
  console.log('✓ Initializing Telegram Adapter...');
  const telegram = new TelegramAdapter({
    token: config.telegram.token,
    mode: config.telegram.mode,
    dmPolicy: 'open',
    streaming: { enabled: true },
  });
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ✅ Bot is ready');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('🚀 Listening for messages...');
  console.log('');
  
  // Message counter
  let messageCount = 0;
  
  // Setup message handler
  telegram.on('message', async (message) => {
    messageCount++;
    const chatId = message.chatId;
    const userId = message.userId;
    const text = message.text || '';
    
    console.log(`📨 [${messageCount}] Message from ${userId}: "${text}"`);
    
    try {
      const sessionKey = `telegram:${chatId}:${userId}`;
      
      // Process with Skill Registry if enabled
      if (skillIntegration) {
        const skillResult = await skillIntegration.processMessage(text, sessionKey);
        
        if (skillResult.activatedSkills.length > 0) {
          console.log(`  🎯 Skills: ${skillResult.activatedSkills.join(', ')}`);
        }
      }
      
      // Execute agent
      const handle = await agent.execute({
        message: text,
        sessionId: sessionKey,
      });
      
      console.log(`  🆔 Run: ${handle.runId}`);
      
      // Stream response to Telegram
      let streamedText = '';
      let sentMessage: any = null;
      let lastEditTime = 0;
      const MIN_EDIT_INTERVAL = 500; // ms
      
      for await (const event of handle.events) {
        if (event.type === 'model.delta') {
          streamedText += event.delta;
          
          const now = Date.now();
          if (!sentMessage) {
            // Send first chunk
            sentMessage = await telegram.sendMessage(chatId, streamedText);
            lastEditTime = now;
          } else if (now - lastEditTime >= MIN_EDIT_INTERVAL && streamedText.length > 0) {
            // Edit message periodically
            try {
              await telegram.editMessage(chatId, sentMessage.message_id, streamedText);
              lastEditTime = now;
            } catch {
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
            } catch {
              await telegram.sendMessage(chatId, content);
            }
          } else if (!sentMessage && content) {
            await telegram.sendMessage(chatId, content);
          }
          
          const tokens = event.response?.usage?.totalTokens || 0;
          console.log(`  ✅ Sent (${tokens} tokens)`);
        }
        
        if (event.type === 'run.error') {
          console.error(`  ❌ Error: ${event.error}`);
          await telegram.sendMessage(chatId, `❌ Error: ${event.error}`);
        }
      }
      
    } catch (error: any) {
      console.error(`❌ Failed to process message: ${error.message}`);
      try {
        await telegram.sendMessage(chatId, `❌ Error: ${error.message}`);
      } catch {
        // Ignore
      }
    }
  });
  
  // Error handler
  telegram.on('error', (error) => {
    console.error('❌ Telegram error:', error);
  });
  
  // Start the bot
  await telegram.start();
  
  // Graceful shutdown
  const shutdown = async () => {
    console.log('');
    console.log('🛑 Shutting down...');
    
    if (browserCleanup) {
      console.log('  Closing browser...');
      await browserCleanup();
    }
    
    if (fileWatcher && typeof (fileWatcher as any).stop === 'function') {
      await (fileWatcher as any).stop();
    }
    
    await telegram.stop();
    
    console.log('✅ Shutdown complete');
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ============================================================================
// Entry Point
// ============================================================================

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
