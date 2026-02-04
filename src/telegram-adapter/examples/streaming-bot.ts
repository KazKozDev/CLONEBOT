/**
 * Example: Streaming Bot
 */

import { TelegramAdapter, ParsedMessage } from '../index';

async function main() {
  const adapter = new TelegramAdapter({
    token: process.env.TELEGRAM_BOT_TOKEN!,
    mode: 'polling',
    streaming: {
      enabled: true,
      minEditInterval: 500,
    },
  });

  adapter.on('message', async (message: ParsedMessage) => {
    if (!message.text) return;
    
    // Simulate streaming response
    async function* generateResponse() {
      const words = `Here is a streaming response to your message: "${message.text}". 
      This demonstrates how messages can be updated in real-time as the bot generates its response.`.split(' ');
      
      let accumulated = '';
      
      for (const word of words) {
        accumulated += word + ' ';
        yield accumulated.trim();
        
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    await adapter.sendStreaming(message.chatId, generateResponse());
  });

  await adapter.start();
  console.log('Streaming bot started!');
}

main().catch(console.error);
