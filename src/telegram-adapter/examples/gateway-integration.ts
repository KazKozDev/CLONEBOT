/**
 * Telegram Gateway Integration
 * 
 * Example showing how to integrate Telegram webhook with Gateway Server
 */

import { TelegramAdapter } from '../TelegramAdapter';
import { GatewayServer } from '../../gateway-server/GatewayServer';
import type { IncomingMessage, ServerResponse } from 'http';

async function main() {
  // Initialize Telegram adapter in webhook mode
  const telegramAdapter = new TelegramAdapter({
    token: process.env.TELEGRAM_BOT_TOKEN!,
    mode: 'webhook',
    webhook: {
      url: process.env.TELEGRAM_WEBHOOK_URL!, // e.g., https://example.com/telegram/webhook
      path: '/telegram/webhook',
      secretToken: process.env.TELEGRAM_WEBHOOK_SECRET,
    },
    dmPolicy: 'pairing',
    defaultParseMode: 'Markdown',
  });

  // Initialize Gateway Server
  const gateway = new GatewayServer({
    port: parseInt(process.env.PORT || '3000'),
    host: '0.0.0.0',
    cors: {
      enabled: true,
      origins: ['*'],
    },
    rateLimit: {
      enabled: true,
      maxRequests: 100,
      windowMs: 60000,
    },
  });

  // Add Telegram webhook route
  const webhookHandler = telegramAdapter.getWebhookHandler();
  
  if (webhookHandler) {
    gateway['router'].addRoute('POST', '/telegram/webhook', async (req: IncomingMessage, res: ServerResponse) => {
      // Telegram webhook handler
      webhookHandler(req, res);
    });
    
    console.log('✅ Telegram webhook route added: POST /telegram/webhook');
  }

  // Add health check endpoint
  gateway['router'].addRoute('GET', '/health', async (req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      telegram: telegramAdapter.isRunning(),
      timestamp: new Date().toISOString(),
    }));
  });

  // Add pairing management endpoints (for admin)
  gateway['router'].addRoute('GET', '/admin/telegram/pairings', async (req: IncomingMessage, res: ServerResponse) => {
    // TODO: Add authentication
    const pairings = telegramAdapter.getPendingPairings();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ pairings }));
  });

  gateway['router'].addRoute('POST', '/admin/telegram/pairings/approve', async (req: IncomingMessage, res: ServerResponse) => {
    // TODO: Add authentication
    // TODO: Parse request body
    // const { userId, code } = await parseBody(req);
    // const approved = telegramAdapter.approvePairing(userId, code);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  });

  // Start Gateway Server
  await gateway.start();
  console.log(`✅ Gateway Server started on ${gateway['config'].host}:${gateway['config'].port}`);

  // Start Telegram adapter
  await telegramAdapter.start();
  console.log('✅ Telegram adapter started in webhook mode');
  console.log(`📱 Bot username: @${telegramAdapter.getBotUsername()}`);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    await telegramAdapter.stop();
    await gateway.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
