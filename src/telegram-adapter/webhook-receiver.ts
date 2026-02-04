/**
 * Webhook Receiver
 * 
 * Receives updates from Telegram via webhook
 */

import { TelegramApiClient } from './api-client';
import { TelegramUpdate, WebhookConfig } from './types';
import { EventEmitter } from 'events';
import { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';

export class WebhookReceiver extends EventEmitter {
  private webhookUrl: string | null = null;
  private secretToken: string | null = null;
  
  constructor(
    private apiClient: TelegramApiClient,
    private config: WebhookConfig
  ) {
    super();
    this.webhookUrl = config.url;
    this.secretToken = config.secretToken ?? null;
  }

  /**
   * Set up webhook with Telegram
   */
  async setWebhook(url?: string): Promise<void> {
    const webhookUrl = url ?? this.webhookUrl;
    
    if (!webhookUrl) {
      throw new Error('Webhook URL is required');
    }
    
    const params: any = {
      url: webhookUrl,
    };
    
    if (this.secretToken) {
      params.secret_token = this.secretToken;
    }
    
    await this.apiClient.call('setWebhook', params);
    this.webhookUrl = webhookUrl;
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(): Promise<void> {
    await this.apiClient.call('deleteWebhook');
    this.webhookUrl = null;
  }

  /**
   * Create HTTP request handler for webhook
   */
  createWebhookHandler(): (req: IncomingMessage, res: ServerResponse) => void {
    return (req, res) => {
      this.handleWebhookRequest(req, res).catch(error => {
        this.emit('error', error);
        res.writeHead(500);
        res.end('Internal Server Error');
      });
    };
  }

  /**
   * Handle incoming webhook request
   */
  private async handleWebhookRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    // Only accept POST requests
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }
    
    // Verify secret token if configured
    if (this.secretToken) {
      const headerToken = req.headers['x-telegram-bot-api-secret-token'];
      
      if (headerToken !== this.secretToken) {
        res.writeHead(401);
        res.end('Unauthorized');
        return;
      }
    }
    
    // Read request body
    const body = await this.readRequestBody(req);
    
    // Parse update
    let update: TelegramUpdate;
    try {
      update = JSON.parse(body);
    } catch (error) {
      res.writeHead(400);
      res.end('Invalid JSON');
      return;
    }
    
    // Validate update structure
    if (!this.isValidUpdate(update)) {
      res.writeHead(400);
      res.end('Invalid update structure');
      return;
    }
    
    // Emit update event
    this.emit('update', update);
    
    // Respond quickly (< 60 seconds requirement)
    res.writeHead(200);
    res.end('OK');
  }

  /**
   * Read request body
   */
  private readRequestBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      
      req.on('data', (chunk) => {
        body += chunk;
      });
      
      req.on('end', () => {
        resolve(body);
      });
      
      req.on('error', reject);
    });
  }

  /**
   * Validate update structure
   */
  private isValidUpdate(update: any): update is TelegramUpdate {
    return (
      typeof update === 'object' &&
      typeof update.update_id === 'number'
    );
  }

  /**
   * Get current webhook URL
   */
  getWebhookUrl(): string | null {
    return this.webhookUrl;
  }

  /**
   * Register update handler
   */
  onUpdate(handler: (update: TelegramUpdate) => void): () => void {
    this.on('update', handler);
    return () => this.off('update', handler);
  }

  /**
   * Register error handler
   */
  onError(handler: (error: Error) => void): () => void {
    this.on('error', handler);
    return () => this.off('error', handler);
  }
}
