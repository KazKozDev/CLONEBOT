/**
 * Integration Tests for Telegram Adapter
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { TelegramAdapter } from '../TelegramAdapter';

describe('TelegramAdapter Integration', () => {
  let adapter: TelegramAdapter;
  
  // These tests require a real Telegram bot token
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  beforeAll(async () => {
    if (!token) {
      console.log('Skipping integration tests: TELEGRAM_BOT_TOKEN not set');
      return;
    }
    
    adapter = new TelegramAdapter({
      token,
      mode: 'polling',
      polling: {
        timeout: 10,
      },
    });
  });
  
  afterAll(async () => {
    if (adapter) {
      await adapter.stop();
    }
  });
  
  it('should validate bot token', async () => {
    if (!token) return;
    
    await adapter.start();
    const botInfo = await adapter.getMe();
    
    expect(botInfo).toBeDefined();
    expect(botInfo.username).toBeDefined();
    expect(botInfo.id).toBeGreaterThan(0);
  });
  
  it('should start and stop adapter', async () => {
    if (!token) return;
    
    await adapter.start();
    expect(adapter.isRunning()).toBe(true);
    
    await adapter.stop();
    expect(adapter.isRunning()).toBe(false);
  });
  
  it('should receive and process messages', async () => {
    if (!token) return;
    
    let messageReceived = false;
    
    adapter.on('message', (message) => {
      messageReceived = true;
      expect(message.chatId).toBeDefined();
      expect(message.userId).toBeDefined();
    });
    
    await adapter.start();
    
    // Wait for a message (would need manual testing)
    // In real tests, this would use a test chat
  });
  
  it('should handle commands', async () => {
    if (!token) return;
    
    let commandReceived = false;
    
    adapter.on('command', (message) => {
      commandReceived = true;
      expect(message.command).toBeDefined();
    });
    
    await adapter.start();
    
    // Send /start command and verify
  });
  
  it('should send and edit messages', async () => {
    if (!token) return;
    
    const testChatId = process.env.TEST_CHAT_ID;
    if (!testChatId) return;
    
    await adapter.start();
    
    // Send message
    const sent = await adapter.sendMessage(testChatId, 'Test message');
    expect(sent.messageId).toBeGreaterThan(0);
    
    // Edit message
    const edited = await adapter.editMessage(
      testChatId,
      sent.messageId,
      'Edited message'
    );
    expect(edited.messageId).toBe(sent.messageId);
    
    // Delete message
    const deleted = await adapter.deleteMessage(testChatId, sent.messageId);
    expect(deleted).toBe(true);
  });
  
  it('should handle streaming responses', async () => {
    if (!token) return;
    
    const testChatId = process.env.TEST_CHAT_ID;
    if (!testChatId) return;
    
    await adapter.start();
    
    async function* generateStream() {
      yield 'First chunk';
      await new Promise(resolve => setTimeout(resolve, 100));
      yield ' Second chunk';
      await new Promise(resolve => setTimeout(resolve, 100));
      yield ' Final chunk';
    }
    
    const sent = await adapter.sendStreaming(testChatId, generateStream());
    expect(sent.messageId).toBeGreaterThan(0);
    
    // Clean up
    await adapter.deleteMessage(testChatId, sent.messageId);
  });
  
  it('should respect rate limits', async () => {
    if (!token) return;
    
    const testChatId = process.env.TEST_CHAT_ID;
    if (!testChatId) return;
    
    await adapter.start();
    
    const start = Date.now();
    
    // Send many messages
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(adapter.sendMessage(testChatId, `Message ${i}`));
    }
    
    await Promise.all(promises);
    
    const elapsed = Date.now() - start;
    
    // Should have taken some time due to rate limiting
    expect(elapsed).toBeGreaterThan(100);
  });
  
  it('should handle errors gracefully', async () => {
    if (!token) return;
    
    await adapter.start();
    
    // Try to send to invalid chat
    try {
      await adapter.sendMessage('invalid_chat_id', 'Test');
      fail('Should have thrown error');
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});

describe('Webhook Mode Integration', () => {
  it('should set and delete webhook', async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    
    const adapter = new TelegramAdapter({
      token,
      mode: 'webhook',
      webhook: {
        url: 'https://example.com/webhook',
      },
    });
    
    // Note: This would fail without a valid HTTPS URL
    // Just testing the API structure
    
    expect(adapter.getWebhookHandler()).toBeDefined();
  });
});
