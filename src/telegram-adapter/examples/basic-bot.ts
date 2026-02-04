/**
 * Example: Basic Telegram Bot
 */

import { TelegramAdapter, ParsedMessage, CommandContext } from '../index';

async function main() {
  const adapter = new TelegramAdapter({
    token: process.env.TELEGRAM_BOT_TOKEN!,
    mode: 'polling',
    dmPolicy: 'pairing',
    defaultParseMode: 'Markdown',
    typingIndicator: true,
  });

  // Handle messages
  adapter.on('message', async (message: ParsedMessage) => {
    console.log('Received message:', message.text);
    
    // Send typing indicator
    const typing = (adapter as any)['typingIndicator'].start(message.chatId);
    
    try {
      // Echo the message back
      await adapter.sendMessage(
        message.chatId,
        `You said: *${message.text}*`,
        { parseMode: 'Markdown' }
      );
    } finally {
      typing.stop();
    }
  });

  // Handle commands
  (adapter as any)['commandHandler'].registerCommand('hello', async (ctx: CommandContext) => {
    await adapter.sendMessage(
      ctx.message.chatId,
      `Hello, ${ctx.message.displayName}! 👋`
    );
  });

  // Handle errors
  adapter.on('error', (error: Error) => {
    console.error('Adapter error:', error);
  });

  // Start the bot
  await adapter.start();
  console.log('Bot started!');
  console.log('Bot username:', adapter.getBotUsername());
}

main().catch(console.error);
