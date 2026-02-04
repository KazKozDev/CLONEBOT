/**
 * Telegram Configuration
 */

import type { TelegramAdapterConfig } from '../telegram-adapter/types';

/**
 * Development configuration (polling mode)
 */
export const telegramDevConfig: TelegramAdapterConfig = {
  token: process.env.TELEGRAM_BOT_TOKEN || '',
  mode: 'polling',
  
  polling: {
    timeout: 30,
    interval: 0,
    allowedUpdates: ['message', 'edited_message', 'callback_query'],
  },
  
  dmPolicy: 'pairing',
  allowlist: [],
  
  streaming: {
    enabled: true,
    minEditInterval: 500,
    maxEditsPerMessage: 50,
  },
  
  rateLimit: {
    messagesPerSecond: 25,
    messagesPerMinutePerGroup: 18,
  },
  
  defaultParseMode: 'Markdown',
  typingIndicator: true,
  commandPrefix: '/',
};

/**
 * Production configuration (webhook mode)
 */
export const telegramProdConfig: TelegramAdapterConfig = {
  token: process.env.TELEGRAM_BOT_TOKEN || '',
  mode: 'webhook',
  
  webhook: {
    url: process.env.TELEGRAM_WEBHOOK_URL || '',
    path: '/telegram/webhook',
    secretToken: process.env.TELEGRAM_WEBHOOK_SECRET,
  },
  
  dmPolicy: 'pairing',
  allowlist: [],
  
  streaming: {
    enabled: true,
    minEditInterval: 500,
    maxEditsPerMessage: 50,
  },
  
  rateLimit: {
    messagesPerSecond: 25,
    messagesPerMinutePerGroup: 18,
  },
  
  defaultParseMode: 'Markdown',
  typingIndicator: true,
  commandPrefix: '/',
};

/**
 * Get configuration based on environment
 */
export function getTelegramConfig(): TelegramAdapterConfig {
  const env = process.env.NODE_ENV || 'development';
  
  if (env === 'production') {
    return telegramProdConfig;
  }
  
  return telegramDevConfig;
}
