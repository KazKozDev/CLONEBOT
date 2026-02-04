/**
 * Streaming Sender
 * 
 * Handles streaming responses through message editing
 */

import { MessageSender } from './message-sender';
import { SentMessage, StreamingSenderOptions } from './types';
import { MarkdownFormatter } from './markdown-formatter';

export class StreamingSender {
  private messageId: number | null = null;
  private accumulatedText = '';
  private lastEditTime = 0;
  private isCompleted = false;
  private isAborted = false;
  
  private readonly minEditInterval: number;
  private readonly parseMode: 'Markdown' | 'MarkdownV2' | 'HTML' | undefined;
  private readonly replyToMessageId: number | undefined;

  constructor(
    private chatId: string | number,
    private sender: MessageSender,
    private formatter: MarkdownFormatter,
    options: StreamingSenderOptions = {}
  ) {
    this.minEditInterval = options.minEditInterval ?? 500;
    this.parseMode = options.parseMode;
    this.replyToMessageId = options.replyToMessageId;
  }

  /**
   * Send first block of text
   */
  async send(text: string): Promise<void> {
    if (this.messageId !== null) {
      throw new Error('Message already sent');
    }
    
    this.accumulatedText = text;
    
    // Split if too long
    const chunks = this.formatter.splitMessage(text);
    
    const sent = await this.sender.send(this.chatId, chunks[0], {
      parseMode: this.parseMode,
      replyToMessageId: this.replyToMessageId,
    });
    
    this.messageId = sent.messageId;
    this.lastEditTime = Date.now();
    
    // If split, send remaining chunks as separate messages
    if (chunks.length > 1) {
      for (let i = 1; i < chunks.length; i++) {
        await this.sender.send(this.chatId, chunks[i], {
          parseMode: this.parseMode,
        });
      }
    }
  }

  /**
   * Update message with new text
   */
  async update(text: string): Promise<void> {
    if (this.isAborted) {
      return;
    }
    
    if (this.isCompleted) {
      throw new Error('Message already completed');
    }
    
    if (this.messageId === null) {
      // First update, send as new message
      await this.send(text);
      return;
    }
    
    this.accumulatedText = text;
    
    // Check if enough time has passed since last edit
    const timeSinceLastEdit = Date.now() - this.lastEditTime;
    
    if (timeSinceLastEdit < this.minEditInterval) {
      // Too soon, skip this edit
      return;
    }
    
    // Split if too long
    const chunks = this.formatter.splitMessage(text);
    
    if (chunks.length > 1) {
      // Message is too long, need to handle split
      await this.handleLongMessage(chunks);
      return;
    }
    
    try {
      await this.sender.edit(this.chatId, this.messageId, text, {
        parseMode: this.parseMode,
      });
      
      this.lastEditTime = Date.now();
    } catch (error) {
      // If edit fails, try to send as new message
      await this.handleEditFailure(text);
    }
  }

  /**
   * Complete streaming and finalize message
   */
  async complete(): Promise<SentMessage> {
    if (this.isAborted) {
      throw new Error('Message was aborted');
    }
    
    if (this.isCompleted) {
      throw new Error('Message already completed');
    }
    
    this.isCompleted = true;
    
    if (this.messageId === null) {
      // No message sent yet, send final text
      const sent = await this.sender.send(this.chatId, this.accumulatedText, {
        parseMode: this.parseMode,
        replyToMessageId: this.replyToMessageId,
      });
      
      return sent;
    }
    
    // Final edit with complete text
    const chunks = this.formatter.splitMessage(this.accumulatedText);
    
    if (chunks.length > 1) {
      // Message is too long, handle split
      await this.handleLongMessage(chunks);
    } else {
      try {
        await this.sender.edit(this.chatId, this.messageId, this.accumulatedText, {
          parseMode: this.parseMode,
        });
      } catch (error) {
        // If final edit fails, that's okay
      }
    }
    
    return {
      messageId: this.messageId,
      chatId: this.chatId.toString(),
      text: this.accumulatedText,
      date: Date.now() / 1000,
    };
  }

  /**
   * Abort streaming
   */
  abort(): void {
    this.isAborted = true;
  }

  /**
   * Handle long message that needs to be split
   */
  private async handleLongMessage(chunks: string[]): Promise<void> {
    if (this.messageId === null) {
      // Send first chunk
      const sent = await this.sender.send(this.chatId, chunks[0], {
        parseMode: this.parseMode,
        replyToMessageId: this.replyToMessageId,
      });
      this.messageId = sent.messageId;
    } else {
      // Edit first chunk
      try {
        await this.sender.edit(this.chatId, this.messageId, chunks[0], {
          parseMode: this.parseMode,
        });
      } catch (error) {
        // Ignore edit errors
      }
    }
    
    // Send remaining chunks as new messages
    for (let i = 1; i < chunks.length; i++) {
      await this.sender.send(this.chatId, chunks[i], {
        parseMode: this.parseMode,
      });
    }
    
    this.lastEditTime = Date.now();
  }

  /**
   * Handle edit failure
   */
  private async handleEditFailure(text: string): Promise<void> {
    // Send as new message
    const sent = await this.sender.send(this.chatId, text, {
      parseMode: this.parseMode,
    });
    
    // Update message ID to the new message
    this.messageId = sent.messageId;
    this.lastEditTime = Date.now();
  }

  /**
   * Create streaming sender instance
   */
  static create(
    chatId: string | number,
    sender: MessageSender,
    formatter: MarkdownFormatter,
    options?: StreamingSenderOptions
  ): StreamingSender {
    return new StreamingSender(chatId, sender, formatter, options);
  }
}
