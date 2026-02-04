/**
 * Telegram Adapter
 * 
 * Main facade for Telegram channel adapter
 */

import { EventEmitter } from 'events';
import { TelegramApiClient } from './api-client';
import { BotValidator } from './bot-validator';
import { LongPollingReceiver } from './polling-receiver';
import { WebhookReceiver } from './webhook-receiver';
import { UpdateParser } from './update-parser';
import { MessageSender } from './message-sender';
import { MediaHandler } from './media-handler';
import { MarkdownFormatter } from './markdown-formatter';
import { StreamingSender } from './streaming-sender';
import { RateLimiter } from './rate-limiter';
import { SessionRouter } from './session-router';
import { DMPolicyHandler } from './dm-policy-handler';
import { TelegramCommandHandler } from './command-handler';
import { CallbackQueryHandler } from './callback-handler';
import { TypingIndicator } from './typing-indicator';
import { TelegramErrorHandler } from './error-handler';
import {
  TelegramAdapterConfig,
  TelegramAdapterEventMap,
  TelegramAdapterEventType,
  BotInfo,
  SentMessage,
  MessageOptions,
  MediaSource,
  StreamingSenderOptions,
  PairingRequest,
  TelegramUpdate,
  ParsedMessage,
  ParsedCallback,
} from './types';

export class TelegramAdapter extends EventEmitter {
  private apiClient: TelegramApiClient;
  private botValidator: BotValidator;
  private pollingReceiver: LongPollingReceiver | null = null;
  private webhookReceiver: WebhookReceiver | null = null;
  private updateParser: UpdateParser;
  private messageSender: MessageSender;
  private mediaHandler: MediaHandler;
  private markdownFormatter: MarkdownFormatter;
  private rateLimiter: RateLimiter;
  private sessionRouter: SessionRouter;
  private dmPolicyHandler: DMPolicyHandler;
  private commandHandler: TelegramCommandHandler;
  private callbackHandler: CallbackQueryHandler;
  private typingIndicator: TypingIndicator;
  private errorHandler: TelegramErrorHandler;
  
  private running = false;
  private config: TelegramAdapterConfig;

  constructor(config: TelegramAdapterConfig) {
    super();
    this.config = config;
    
    // Initialize components
    this.apiClient = new TelegramApiClient({
      token: config.token,
    });
    
    this.botValidator = new BotValidator(this.apiClient);
    this.updateParser = new UpdateParser();
    this.messageSender = new MessageSender(this.apiClient);
    this.mediaHandler = new MediaHandler(this.apiClient, config.token);
    this.markdownFormatter = new MarkdownFormatter();
    this.rateLimiter = new RateLimiter(config.rateLimit);
    this.sessionRouter = new SessionRouter();
    
    this.dmPolicyHandler = new DMPolicyHandler(
      config.dmPolicy ?? 'pairing',
      config.allowlist ?? []
    );
    
    this.commandHandler = new TelegramCommandHandler(config.commandPrefix);
    this.callbackHandler = new CallbackQueryHandler();
    this.typingIndicator = new TypingIndicator(this.messageSender);
    this.errorHandler = new TelegramErrorHandler(this.messageSender);
    
    // Set up default commands
    this.setupDefaultCommands();
  }

  /**
   * Start the adapter
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    
    // Validate bot token
    try {
      await this.botValidator.validateToken(this.config.token);
    } catch (error) {
      throw new Error(`Failed to start adapter: ${(error as Error).message}`);
    }
    
    // Start receiving updates
    if (this.config.mode === 'polling') {
      this.pollingReceiver = new LongPollingReceiver(
        this.apiClient,
        this.config.polling
      );
      
      this.pollingReceiver.onUpdate((update) => this.handleUpdate(update));
      this.pollingReceiver.onError((error) => this.handleError(error));
      
      this.pollingReceiver.start();
    } else {
      this.webhookReceiver = new WebhookReceiver(
        this.apiClient,
        this.config.webhook!
      );
      
      this.webhookReceiver.onUpdate((update) => this.handleUpdate(update));
      this.webhookReceiver.onError((error) => this.handleError(error));
      
      await this.webhookReceiver.setWebhook();
    }
    
    this.running = true;
    this.emit('started');
  }

  /**
   * Stop the adapter
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    
    this.running = false;
    
    // Stop receiving updates
    if (this.pollingReceiver) {
      await this.pollingReceiver.stop();
      this.pollingReceiver = null;
    }
    
    if (this.webhookReceiver) {
      await this.webhookReceiver.deleteWebhook();
      this.webhookReceiver = null;
    }
    
    // Stop all typing indicators
    this.typingIndicator.stopAll();
    
    this.emit('stopped');
  }

  /**
   * Check if adapter is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Send a text message
   */
  async sendMessage(
    chatId: string | number,
    content: string,
    options: MessageOptions = {}
  ): Promise<SentMessage> {
    const isGroup = this.isGroupChatId(chatId);
    
    // Acquire rate limit permission
    await this.rateLimiter.acquire(chatId.toString(), isGroup);
    
    try {
      const sent = await this.messageSender.send(chatId, content, {
        parseMode: options.parseMode ?? this.config.defaultParseMode,
        ...options,
      });
      
      this.rateLimiter.release(chatId.toString(), isGroup);
      
      return sent;
    } catch (error) {
      this.rateLimiter.release(chatId.toString(), isGroup);
      throw error;
    }
  }

  /**
   * Edit a message
   */
  async editMessage(
    chatId: string | number,
    messageId: number,
    content: string,
    options: MessageOptions = {}
  ): Promise<SentMessage> {
    return this.messageSender.edit(chatId, messageId, content, {
      parseMode: options.parseMode ?? this.config.defaultParseMode,
      ...options,
    });
  }

  /**
   * Delete a message
   */
  async deleteMessage(chatId: string | number, messageId: number): Promise<boolean> {
    return this.messageSender.delete(chatId, messageId);
  }

  /**
   * Send media
   */
  async sendMedia(
    chatId: string | number,
    media: MediaSource,
    options: MessageOptions = {}
  ): Promise<SentMessage> {
    const isGroup = this.isGroupChatId(chatId);
    await this.rateLimiter.acquire(chatId.toString(), isGroup);
    
    try {
      let sent: SentMessage;
      
      switch (media.type) {
        case 'photo':
          sent = await this.mediaHandler.sendPhoto(chatId, media.source, {
            caption: media.caption,
            parseMode: media.parseMode ?? this.config.defaultParseMode,
            ...options,
          });
          break;
        
        case 'document':
          sent = await this.mediaHandler.sendDocument(chatId, media.source, {
            caption: media.caption,
            parseMode: media.parseMode ?? this.config.defaultParseMode,
            ...options,
          });
          break;
        
        case 'audio':
          sent = await this.mediaHandler.sendAudio(chatId, media.source, {
            caption: media.caption,
            parseMode: media.parseMode ?? this.config.defaultParseMode,
            ...options,
          });
          break;
        
        case 'video':
          sent = await this.mediaHandler.sendVideo(chatId, media.source, {
            caption: media.caption,
            parseMode: media.parseMode ?? this.config.defaultParseMode,
            ...options,
          });
          break;
        
        case 'voice':
          sent = await this.mediaHandler.sendVoice(chatId, media.source, {
            caption: media.caption,
            parseMode: media.parseMode ?? this.config.defaultParseMode,
            ...options,
          });
          break;
        
        default:
          throw new Error(`Unsupported media type: ${(media as any).type}`);
      }
      
      this.rateLimiter.release(chatId.toString(), isGroup);
      return sent;
    } catch (error) {
      this.rateLimiter.release(chatId.toString(), isGroup);
      throw error;
    }
  }

  /**
   * Send streaming response
   */
  async sendStreaming(
    chatId: string | number,
    stream: AsyncIterable<string>,
    options: StreamingSenderOptions = {}
  ): Promise<SentMessage> {
    const sender = StreamingSender.create(
      chatId,
      this.messageSender,
      this.markdownFormatter,
      {
        parseMode: options.parseMode ?? this.config.defaultParseMode,
        minEditInterval: options.minEditInterval ?? this.config.streaming?.minEditInterval,
        ...options,
      }
    );
    
    let accumulatedText = '';
    
    for await (const chunk of stream) {
      accumulatedText += chunk;
      await sender.update(accumulatedText);
    }
    
    return sender.complete();
  }

  /**
   * Send typing indicator
   */
  async sendTyping(chatId: string | number): Promise<void> {
    await this.messageSender.sendAction(chatId, 'typing');
  }

  /**
   * Download file
   */
  async downloadFile(fileId: string): Promise<Buffer> {
    const downloaded = await this.mediaHandler.download(fileId);
    return downloaded.buffer;
  }

  /**
   * Answer callback query
   */
  async answerCallbackQuery(
    queryId: string,
    options: {
      text?: string;
      showAlert?: boolean;
      url?: string;
      cacheTime?: number;
    } = {}
  ): Promise<void> {
    await this.messageSender.answerCallback(queryId, options);
  }

  /**
   * Get bot info
   */
  async getMe(): Promise<BotInfo> {
    return this.botValidator.getBotInfo();
  }

  /**
   * Get bot username
   */
  getBotUsername(): string {
    return this.botValidator.getBotUsername();
  }

  /**
   * Configure adapter
   */
  configure(config: Partial<TelegramAdapterConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (config.dmPolicy) {
      this.dmPolicyHandler.setPolicy(config.dmPolicy);
    }
    
    if (config.rateLimit) {
      this.rateLimiter = new RateLimiter(config.rateLimit);
    }
  }

  /**
   * Add user to allowlist
   */
  addToAllowlist(userId: string): void {
    this.dmPolicyHandler.addToAllowlist(userId);
  }

  /**
   * Remove user from allowlist
   */
  removeFromAllowlist(userId: string): void {
    this.dmPolicyHandler.removeFromAllowlist(userId);
  }

  /**
   * Get pending pairing requests
   */
  getPendingPairings(): PairingRequest[] {
    return this.dmPolicyHandler.getPendingPairings();
  }

  /**
   * Approve pairing with code
   */
  approvePairing(userId: string, code: string): boolean {
    return this.dmPolicyHandler.verifyPairingCode(userId, code);
  }

  /**
   * Handle incoming update
   */
  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    try {
      const parsed = this.updateParser.parseUpdate(update);
      
      if (!parsed) {
        return;
      }
      
      if ('id' in parsed && 'from' in parsed && !('text' in parsed)) {
        // Callback query
        const callback = parsed as ParsedCallback;
        this.emit('callback', callback);
        await this.callbackHandler.handleCallback(callback);
        
        // Always answer callback query
        await this.answerCallbackQuery(callback.id);
      } else {
        // Message
        const message = parsed as ParsedMessage;
        await this.handleMessage(message);
      }
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(message: ParsedMessage): Promise<void> {
    // Check DM policy for private chats
    if (message.chatType === 'private') {
      const accessCheck = this.dmPolicyHandler.checkAccess(message.userId);
      
      if (!accessCheck.allowed) {
        if (this.dmPolicyHandler.getPolicy() === 'pairing') {
          // Generate pairing code
          const code = this.dmPolicyHandler.generatePairingCode(message.userId);
          
          await this.sendMessage(
            message.chatId,
            `🔐 Please verify your access.\n\nPairing code: *${code}*\n\nAsk the bot administrator to approve this code.`,
            { parseMode: 'Markdown' }
          );
        } else {
          await this.sendMessage(
            message.chatId,
            '❌ You do not have permission to use this bot.'
          );
        }
        return;
      }
    }
    
    // Check if it's a command
    if (await this.commandHandler.handleCommand(message)) {
      this.emit('command', message);
      return;
    }
    
    // Regular message
    this.emit('message', message);
  }

  /**
   * Handle error
   */
  private handleError(error: Error): void {
    this.errorHandler.logError(error);
    this.emit('error', error);
    
    if (this.errorHandler.isFatal(error)) {
      this.stop();
    }
  }

  /**
   * Set up default commands
   */
  private setupDefaultCommands(): void {
    this.commandHandler.registerCommand('start', async (ctx) => {
      const botInfo = this.botValidator.getBotInfo();
      await this.sendMessage(
        ctx.message.chatId,
        `👋 Hello! I'm *${botInfo.firstName}*.\n\nHow can I help you today?`,
        { parseMode: 'Markdown' }
      );
    });
    
    this.commandHandler.registerCommand('help', async (ctx) => {
      const helpText = `
*Available Commands:*

/start - Start a conversation
/new - Start a new session
/help - Show this help message
/cancel - Cancel current operation

Send me a message and I'll do my best to help!
      `.trim();
      
      await this.sendMessage(ctx.message.chatId, helpText, {
        parseMode: 'Markdown',
      });
    });
  }

  /**
   * Check if chat ID belongs to a group
   */
  private isGroupChatId(chatId: string | number): boolean {
    // This is a simplified check
    // In real implementation, we'd track chat types
    return false;
  }

  /**
   * Get webhook handler (for integration with Gateway)
   */
  getWebhookHandler(): ((req: any, res: any) => void) | null {
    return this.webhookReceiver?.createWebhookHandler() ?? null;
  }

  // EventEmitter type-safe methods
  override on<T extends TelegramAdapterEventType>(
    event: T,
    listener: (...args: TelegramAdapterEventMap[T]) => void
  ): this {
    return super.on(event, listener);
  }

  override emit<T extends TelegramAdapterEventType>(
    event: T,
    ...args: TelegramAdapterEventMap[T]
  ): boolean {
    return super.emit(event, ...args);
  }
}
