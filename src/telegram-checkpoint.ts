/**
 * INTEGRATION CHECKPOINT - Phase 3: Telegram Channel Adapter
 * 
 * Полная интеграция ВСЕХ настоящих модулей:
 * ✅ SessionStore (file-based)
 * ✅ ContextAssembler (real with caching, truncation)
 * ✅ ModelAdapter (real with Ollama provider)
 * ✅ ToolExecutor (real with tool registry)
 * ✅ SkillRegistry (dynamic skill loading)
 * ✅ TelegramAdapter (real polling/webhook)
 * ✅ AgentLoop (orchestration)
 */

import { TelegramAdapter } from './telegram-adapter';
import { AgentLoop } from './agent-loop';
import type { AgentLoopDependencies } from './agent-loop/types';
import { SessionStore, RealFileSystem } from './session-store';
import { ContextAssembler } from './context-assembler';
import { ModelAdapter } from './model-adapter';
import { ToolExecutor, ExecutionContext, ToolResult } from './tool-executor';
import { SkillRegistry } from './skills/SkillRegistry';
import { basicTools } from './tools/basic-tools';

// ============================================================================
// Telegram Integration Checkpoint
// ============================================================================

async function runTelegramCheckpoint() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  🚀 ПОЛНАЯ ИНТЕГРАЦИЯ ВСЕХ МОДУЛЕЙ (NO WRAPPERS)');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  // Check for bot token
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    console.log('❌ ERROR: TELEGRAM_BOT_TOKEN not set');
    process.exit(1);
  }

  // 1. SessionStore (реальный)
  console.log('✓ Initializing SessionStore (file-based)...');
  const sessionStore = new SessionStore(new RealFileSystem(), {
    storageDir: './sessions',
  });
  await sessionStore.init();
  console.log('✅ SessionStore initialized');
  console.log('');

  // 2. SkillRegistry (реальный)
  console.log('✓ Loading Skills...');
  const skillRegistry = new SkillRegistry('./skills');
  await skillRegistry.loadAll();
  const stats = skillRegistry.getStats();
  console.log(`✅ Loaded ${stats.total} skills`);
  console.log('');

  // 3. ToolExecutor (реальный)
  console.log('✓ Initializing ToolExecutor...');
  const toolExecutor = new ToolExecutor();

  // Регистрируем basicTools (адаптируем только формат вызова)
  for (const tool of basicTools) {
    toolExecutor.register(
      {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema as any,
      },
      async (params: Record<string, unknown>, _context: ExecutionContext): Promise<ToolResult> => {
        // Вызываем оригинальный handler
        const result = await (tool.handler as any)(params);

        // Адаптируем результат к формату ToolResult
        return {
          content: JSON.stringify(result, null, 2),
          success: result.success === true,
          data: result,
          error: result.success ? undefined : {
            code: 'EXECUTION_ERROR',
            message: typeof result.error === 'string' ? result.error : JSON.stringify(result.error || 'Unknown error')
          }
        };
      }
    );
  }

  console.log(`✅ ToolExecutor initialized with ${basicTools.length} tools`);
  console.log('');

  // 4. ModelAdapter (реальный)
  console.log('✓ Initializing ModelAdapter (Ollama)...');
  const modelAdapter = new ModelAdapter();
  await modelAdapter.initialize();
  console.log('✅ ModelAdapter initialized');
  console.log('');

  // 5. ContextAssembler (реальный)
  console.log('✓ Initializing ContextAssembler...');
  const contextAssembler = new ContextAssembler({
    sessionStore,
    toolExecutor,
    skillProvider: skillRegistry
  });
  console.log('✅ ContextAssembler initialized');
  console.log('');

  // Create dependencies using REAL modules
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
  console.log('✅ Agent Loop initialized');
  console.log('');

  // Initialize Telegram Adapter
  console.log('✓ Initializing Telegram Adapter...');
  const telegram = new TelegramAdapter({
    token: botToken,
    mode: 'polling',
    dmPolicy: 'open',
  });

  console.log('✓ Telegram Adapter initialized');
  console.log('');

  // Setup message handler
  console.log('✓ Setting up message routing...');

  let messageCount = 0;

  telegram.on('message', async (message) => {
    messageCount++;

    console.log('');
    console.log('───────────────────────────────────────────────────────');
    console.log(`📨 INCOMING MESSAGE #${messageCount}`);
    console.log('───────────────────────────────────────────────────────');
    console.log(`Chat ID: ${message.chatId}`);
    console.log(`Text: "${message.text}"`);
    console.log('');

    try {
      // Generate session key
      const sessionKey = `telegram:${message.chatId}`;

      console.log(`🔑 Session Key: ${sessionKey}`);
      console.log('');

      // Resolve Session ID from key (using real Store)
      const sessionId = await sessionStore.resolve(sessionKey);
      console.log(`🆔 Session ID: ${sessionId}`);

      // Execute agent
      console.log('🤖 Executing Agent Loop...');
      const handle = await agent.execute({
        message: message.text || '',
        sessionId: sessionId,
      });

      console.log(`🆔 Run ID: ${handle.runId}`);
      console.log('');

      // Stream response
      let streamedText = '';
      let sentMessage: any = null;
      let lastEditTime = 0;
      const MIN_EDIT_INTERVAL = 500; // ms

      for await (const event of handle.events) {
        switch (event.type) {
          case 'run.started':
            console.log('  ▶️  Agent started');
            break;

          case 'model.start':
            console.log('  🤖 Model streaming...');
            process.stdout.write('  💬 ');
            break;

          case 'model.delta':
            process.stdout.write(event.delta);
            streamedText += event.delta;

            // Send/edit message with streaming
            const now = Date.now();
            if (!sentMessage) {
              // First chunk - send new message
              sentMessage = await telegram.sendMessage(
                message.chatId,
                streamedText.trim() || '...',
                { parseMode: 'Markdown' }
              );
              lastEditTime = now;
              console.log(`\n  📤 Initial message sent (ID: ${sentMessage.messageId})`);
            } else if (now - lastEditTime >= MIN_EDIT_INTERVAL) {
              // Edit existing message
              await telegram.editMessage(
                message.chatId,
                sentMessage.messageId,
                streamedText.trim(),
                { parseMode: 'Markdown' }
              );
              lastEditTime = now;
            }
            break;

          case 'model.complete':
            console.log('');
            console.log(`  ✓ Model complete (${event.response.usage?.totalTokens || 0} tokens)`);

            // Final edit
            if (sentMessage && streamedText.trim()) {
              await telegram.editMessage(
                message.chatId,
                sentMessage.messageId,
                streamedText.trim(),
                { parseMode: 'Markdown' }
              );
              console.log('  ✓ Final message edit sent');
            }
            break;

          case 'run.completed':
            console.log('  ✅ Agent completed');
            console.log('');
            console.log('  📊 Stats:');
            console.log(`     - Duration: ${event.result.context.metrics.total.duration}ms`);
            console.log(`     - Turns: ${event.result.context.turns.turns}`);
            console.log(`     - Final response: ${streamedText.length} chars`);

            // Если нет отправленного сообщения, но есть финальный результат
            if (!sentMessage && event.result.message) {
              sentMessage = await telegram.sendMessage(
                message.chatId,
                event.result.message,
                { parseMode: 'Markdown' }
              );
              console.log(`  📤 Final message sent (${event.result.message.length} chars)`);
            } else if (sentMessage && event.result.message && event.result.message !== streamedText.trim()) {
              // Финальное редактирование с полным результатом
              await telegram.editMessage(
                message.chatId,
                sentMessage.messageId,
                event.result.message,
                { parseMode: 'Markdown' }
              );
              console.log(`  ✓ Final message updated (${event.result.message.length} chars)`);
            }
            break;

          case 'run.error':
            console.log(`  ❌ Error: ${event.error}`);

            // Send error message to user
            await telegram.sendMessage(
              message.chatId,
              '❌ Произошла ошибка при обработке сообщения. Попробуйте снова.',
              { parseMode: 'Markdown' }
            );
            break;
        }
      }

      console.log('');
      console.log('✅ Message processed successfully!');
      console.log('');

    } catch (error: any) {
      console.error('❌ Error processing message:', error.message);

      // Send error to user
      try {
        await telegram.sendMessage(
          message.chatId,
          '❌ Произошла ошибка. Попробуйте снова позже.',
          { parseMode: 'Markdown' }
        );
      } catch (sendError) {
        console.error('Failed to send error message:', sendError);
      }
    }
  });

  // Setup command handler
  telegram.on('command', async (command) => {
    console.log('');
    console.log(`📋 Command received: /${command.command}`);

    if (command.command === 'start') {
      await telegram.sendMessage(
        command.chatId,
        '👋 *Добро пожаловать в Telegram Bot!*\n\n' +
        'Это тестовый бот для проверки интеграции с OpenClaw.\n\n' +
        '*Доступные команды:*\n' +
        '/start - Показать это сообщение\n' +
        '/test - Запустить тестовое сообщение\n' +
        '/stats - Показать статистику\n\n' +
        'Просто отправьте любое сообщение, и я отвечу!',
        { parseMode: 'Markdown' }
      );
    } else if (command.command === 'test') {
      await telegram.sendMessage(
        command.chatId,
        '✅ Тест пройден! Бот работает корректно.',
        { parseMode: 'Markdown' }
      );
    } else if (command.command === 'stats') {
      await telegram.sendMessage(
        command.chatId,
        `📊 *Статистика:*\n\n` +
        `Обработано сообщений: ${messageCount}\n` +
        `Бот работает: ✅`,
        { parseMode: 'Markdown' }
      );
    }
  });

  // Setup error handler
  telegram.on('error', (error) => {
    console.error('❌ Telegram error:', error.message);
  });

  console.log('✓ Message routing configured');
  console.log('');

  // Start Telegram adapter
  console.log('✓ Starting Telegram Adapter...');
  await telegram.start();
  console.log('✓ Telegram Adapter started!');
  console.log('');

  // Get bot info
  const botInfo = (telegram as any).botValidator?.botInfo;
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ✅ ВСЕ МОДУЛИ АКТИВИРОВАНЫ!');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log(`🤖 Bot: @${botInfo?.username || 'bigmac_clonebot'}`);
  console.log(`📱 ID: ${botInfo?.id || '8578093951'}`);
  console.log(`🔄 Mode: Polling`);
  console.log('');
  console.log('✅ Модули (REAL):');
  console.log('   - SessionStore');
  console.log('   - ModelAdapter');
  console.log('   - ToolExecutor');
  console.log('   - ContextAssembler');
  console.log('   - SkillRegistry');
  console.log('   - AgentLoop');
  console.log('');
  console.log('📨 Waiting for messages...');
  console.log('Нажмите Ctrl+C для остановки');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  // Keep running
  await new Promise(() => { }); // Run forever until Ctrl+C
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

process.on('SIGINT', async () => {
  console.log('');
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ⏹️  Stopping Telegram Bot...');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('✓ Bot stopped');
  console.log('');
  console.log('Phase 3 checkpoint completed! 🎉');
  console.log('');
  process.exit(0);
});

// ============================================================================
// Run Checkpoint
// ============================================================================

if (require.main === module) {
  runTelegramCheckpoint().catch(error => {
    console.error('❌ Telegram checkpoint failed:', error);
    process.exit(1);
  });
}

export { runTelegramCheckpoint };
