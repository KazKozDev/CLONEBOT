/**
 * Telegram Integration Example
 * 
 * Complete example showing how to integrate Telegram adapter with Agent Loop
 */

import { TelegramAdapter } from '../TelegramAdapter';
import type { ParsedMessage } from '../types';
import { AgentLoop } from '../../agent-loop/AgentLoop';
import { SessionStore } from '../../session-store/SessionStore';
import { MessageBus } from '../../message-bus/MessageBus';
import { ContextAssembler } from '../../context-assembler/ContextAssembler';
import { ModelAdapter } from '../../model-adapter/ModelAdapter';
import { ToolExecutor } from '../../tool-executor/ToolExecutor';
import { GatewayServer } from '../../gateway-server/GatewayServer';
import type { AgentEvent } from '../../agent-loop/types';

async function main() {
  // ============================================================================
  // 1. Initialize Core Components
  // ============================================================================
  
  const messageBus = new MessageBus();
  const sessionStore = new SessionStore();
  
  const modelAdapter = new ModelAdapter({
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });
  
  const toolExecutor = new ToolExecutor();
  
  const contextAssembler = new ContextAssembler({
    modelAdapter,
    maxContextTokens: 100000,
  });
  
  // ============================================================================
  // 2. Initialize Agent Loop
  // ============================================================================
  
  const agentLoop = new AgentLoop({
    messageBus,
    sessionStore,
    modelAdapter,
    toolExecutor,
    contextAssembler,
  });
  
  // ============================================================================
  // 3. Initialize Telegram Adapter
  // ============================================================================
  
  const telegramAdapter = new TelegramAdapter({
    token: process.env.TELEGRAM_BOT_TOKEN!,
    mode: 'polling', // or 'webhook' for production
    
    // DM Policy - require pairing for new users
    dmPolicy: 'pairing',
    allowlist: [],
    
    // Streaming configuration
    streaming: {
      enabled: true,
      minEditInterval: 500,
    },
    
    // Rate limiting (conservative defaults)
    rateLimit: {
      messagesPerSecond: 25,
      messagesPerMinutePerGroup: 18,
    },
    
    // Formatting
    defaultParseMode: 'Markdown',
    typingIndicator: true,
  });
  
  // ============================================================================
  // 4. Set up Message Handling
  // ============================================================================
  
  telegramAdapter.on('message', async (message: ParsedMessage) => {
    console.log(`[Telegram] Message from ${message.displayName}: ${message.text}`);
    
    // Check access (DM policy already checked, but double-check for groups)
    const sessionRouter = (telegramAdapter as any).sessionRouter;
    const dmPolicyHandler = (telegramAdapter as any).dmPolicyHandler;
    
    if (message.chatType === 'private') {
      const access = dmPolicyHandler.checkAccess(message.userId);
      if (!access.allowed) {
        console.log(`[Telegram] Access denied for user ${message.userId}`);
        return; // Already handled by adapter
      }
    }
    
    // Get session key
    const sessionKey = sessionRouter.getSessionKey(message);
    console.log(`[Telegram] Session key: ${sessionKey}`);
    
    // Start typing indicator
    const typingIndicator = (telegramAdapter as any).typingIndicator;
    const typing = typingIndicator.start(message.chatId);
    
    try {
      // Prepare message for agent
      const userMessage = message.text ?? '[Media or unsupported content]';
      
      // Run agent
      const runHandle = await agentLoop.run({
        sessionKey,
        message: userMessage,
        metadata: {
          channel: 'telegram',
          userId: message.userId,
          chatId: message.chatId,
          chatType: message.chatType,
          username: message.username,
          displayName: message.displayName,
        },
      });
      
      // Stream response back to Telegram
      let fullResponse = '';
      const blockStreamer = (telegramAdapter as any).blockStreamer;
      
      // Create streaming sender
      const streamingSender = await telegramAdapter.sendMessage(
        message.chatId,
        '⏳ Processing...',
        {
          replyToMessageId: message.messageId,
        }
      );
      
      let messageId = streamingSender.messageId;
      
      // Listen to agent events
      messageBus.subscribe(sessionKey, (event: AgentEvent) => {
        if (event.type === 'text_chunk') {
          fullResponse += event.chunk;
          
          // Update message (throttled by streaming sender)
          telegramAdapter.editMessage(
            message.chatId,
            messageId,
            fullResponse
          ).catch(() => {
            // Ignore edit errors
          });
        }
        
        if (event.type === 'tool_call') {
          // Show tool execution
          console.log(`[Telegram] Tool call: ${event.toolName}`);
        }
      });
      
      // Wait for completion
      const result = await runHandle.result();
      
      // Send final response
      if (result.response) {
        await telegramAdapter.editMessage(
          message.chatId,
          messageId,
          result.response
        );
      }
      
      console.log(`[Telegram] Response sent (${result.stopReason})`);
      
    } catch (error) {
      console.error('[Telegram] Error processing message:', error);
      
      // Notify user
      await telegramAdapter.sendMessage(
        message.chatId,
        '❌ Sorry, an error occurred while processing your message.',
        {
          replyToMessageId: message.messageId,
        }
      );
    } finally {
      typing.stop();
    }
  });
  
  // ============================================================================
  // 5. Set up Custom Commands
  // ============================================================================
  
  const commandHandler = (telegramAdapter as any).commandHandler;
  
  commandHandler.registerCommand('new', async (ctx: any) => {
    const sessionRouter = (telegramAdapter as any).sessionRouter;
    const sessionKey = sessionRouter.getSessionKey(ctx.message);
    
    // Clear session
    await sessionStore.clearSession(sessionKey);
    
    await telegramAdapter.sendMessage(
      ctx.message.chatId,
      '🔄 Session cleared. Starting fresh!'
    );
  });
  
  commandHandler.registerCommand('stats', async (ctx: any) => {
    const sessionRouter = (telegramAdapter as any).sessionRouter;
    const sessionKey = sessionRouter.getSessionKey(ctx.message);
    
    const session = await sessionStore.getSession(sessionKey);
    
    const messageCount = session?.messages?.length ?? 0;
    const tokenCount = session?.metadata?.totalTokens ?? 0;
    
    await telegramAdapter.sendMessage(
      ctx.message.chatId,
      `📊 *Session Statistics*\n\nMessages: ${messageCount}\nTokens: ${tokenCount}`,
      { parseMode: 'Markdown' }
    );
  });
  
  // ============================================================================
  // 6. Handle Errors
  // ============================================================================
  
  telegramAdapter.on('error', (error: Error) => {
    console.error('[Telegram] Adapter error:', error);
  });
  
  // ============================================================================
  // 7. Start Everything
  // ============================================================================
  
  await telegramAdapter.start();
  console.log('✅ Telegram adapter started');
  console.log(`📱 Bot username: @${telegramAdapter.getBotUsername()}`);
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    await telegramAdapter.stop();
    process.exit(0);
  });
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
