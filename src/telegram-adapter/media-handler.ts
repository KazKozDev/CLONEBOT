/**
 * Media Handler
 * 
 * Handles media upload and download
 */

import { TelegramApiClient } from './api-client';
import { 
  DownloadedFile, 
  MediaSource, 
  SentMessage, 
  TelegramFile,
  TelegramMessage,
  MessageOptions,
} from './types';
import https from 'https';
import { promises as fs } from 'fs';

export class MediaHandler {
  constructor(
    private apiClient: TelegramApiClient,
    private token: string
  ) {}

  /**
   * Download a file by file_id
   */
  async download(fileId: string): Promise<DownloadedFile> {
    // Get file info
    const fileInfo = await this.apiClient.call<TelegramFile>('getFile', {
      file_id: fileId,
    });
    
    if (!fileInfo.file_path) {
      throw new Error('File path not available');
    }
    
    // Download file
    const fileUrl = `https://api.telegram.org/file/bot${this.token}/${fileInfo.file_path}`;
    const buffer = await this.downloadFromUrl(fileUrl);
    
    // Extract filename from path
    const filename = fileInfo.file_path.split('/').pop();
    
    return {
      buffer,
      filename,
      mimeType: this.guessMimeType(filename),
    };
  }

  /**
   * Send photo
   */
  async sendPhoto(
    chatId: string | number,
    source: string | Buffer,
    options: MessageOptions & { caption?: string } = {}
  ): Promise<SentMessage> {
    const params: any = {
      chat_id: chatId,
    };
    
    if (options.caption) {
      params.caption = options.caption;
    }
    
    if (options.parseMode) {
      params.parse_mode = options.parseMode;
    }
    
    if (options.replyToMessageId) {
      params.reply_to_message_id = options.replyToMessageId;
    }
    
    let result: TelegramMessage;
    
    if (typeof source === 'string') {
      // URL or file_id
      params.photo = source;
      result = await this.apiClient.call<TelegramMessage>('sendPhoto', params);
    } else {
      // Buffer - use multipart upload
      result = await this.apiClient.upload<TelegramMessage>('sendPhoto', params, {
        photo: source,
      });
    }
    
    return this.toSentMessage(result);
  }

  /**
   * Send document
   */
  async sendDocument(
    chatId: string | number,
    source: string | Buffer,
    options: MessageOptions & { caption?: string; filename?: string } = {}
  ): Promise<SentMessage> {
    const params: any = {
      chat_id: chatId,
    };
    
    if (options.caption) {
      params.caption = options.caption;
    }
    
    if (options.parseMode) {
      params.parse_mode = options.parseMode;
    }
    
    if (options.replyToMessageId) {
      params.reply_to_message_id = options.replyToMessageId;
    }
    
    let result: TelegramMessage;
    
    if (typeof source === 'string') {
      // URL or file_id
      params.document = source;
      result = await this.apiClient.call<TelegramMessage>('sendDocument', params);
    } else {
      // Buffer - use multipart upload
      result = await this.apiClient.upload<TelegramMessage>('sendDocument', params, {
        document: source,
      });
    }
    
    return this.toSentMessage(result);
  }

  /**
   * Send audio
   */
  async sendAudio(
    chatId: string | number,
    source: string | Buffer,
    options: MessageOptions & { caption?: string; duration?: number; performer?: string; title?: string } = {}
  ): Promise<SentMessage> {
    const params: any = {
      chat_id: chatId,
    };
    
    if (options.caption) {
      params.caption = options.caption;
    }
    
    if (options.duration) {
      params.duration = options.duration;
    }
    
    if (options.performer) {
      params.performer = options.performer;
    }
    
    if (options.title) {
      params.title = options.title;
    }
    
    if (options.parseMode) {
      params.parse_mode = options.parseMode;
    }
    
    if (options.replyToMessageId) {
      params.reply_to_message_id = options.replyToMessageId;
    }
    
    let result: TelegramMessage;
    
    if (typeof source === 'string') {
      params.audio = source;
      result = await this.apiClient.call<TelegramMessage>('sendAudio', params);
    } else {
      result = await this.apiClient.upload<TelegramMessage>('sendAudio', params, {
        audio: source,
      });
    }
    
    return this.toSentMessage(result);
  }

  /**
   * Send video
   */
  async sendVideo(
    chatId: string | number,
    source: string | Buffer,
    options: MessageOptions & { caption?: string; duration?: number; width?: number; height?: number } = {}
  ): Promise<SentMessage> {
    const params: any = {
      chat_id: chatId,
    };
    
    if (options.caption) {
      params.caption = options.caption;
    }
    
    if (options.duration) {
      params.duration = options.duration;
    }
    
    if (options.width) {
      params.width = options.width;
    }
    
    if (options.height) {
      params.height = options.height;
    }
    
    if (options.parseMode) {
      params.parse_mode = options.parseMode;
    }
    
    if (options.replyToMessageId) {
      params.reply_to_message_id = options.replyToMessageId;
    }
    
    let result: TelegramMessage;
    
    if (typeof source === 'string') {
      params.video = source;
      result = await this.apiClient.call<TelegramMessage>('sendVideo', params);
    } else {
      result = await this.apiClient.upload<TelegramMessage>('sendVideo', params, {
        video: source,
      });
    }
    
    return this.toSentMessage(result);
  }

  /**
   * Send voice message
   */
  async sendVoice(
    chatId: string | number,
    source: string | Buffer,
    options: MessageOptions & { caption?: string; duration?: number } = {}
  ): Promise<SentMessage> {
    const params: any = {
      chat_id: chatId,
    };
    
    if (options.caption) {
      params.caption = options.caption;
    }
    
    if (options.duration) {
      params.duration = options.duration;
    }
    
    if (options.parseMode) {
      params.parse_mode = options.parseMode;
    }
    
    if (options.replyToMessageId) {
      params.reply_to_message_id = options.replyToMessageId;
    }
    
    let result: TelegramMessage;
    
    if (typeof source === 'string') {
      params.voice = source;
      result = await this.apiClient.call<TelegramMessage>('sendVoice', params);
    } else {
      result = await this.apiClient.upload<TelegramMessage>('sendVoice', params, {
        voice: source,
      });
    }
    
    return this.toSentMessage(result);
  }

  /**
   * Download file from URL
   */
  private downloadFromUrl(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        const chunks: Buffer[] = [];
        
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        res.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
        
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  /**
   * Guess MIME type from filename
   */
  private guessMimeType(filename?: string): string | undefined {
    if (!filename) return undefined;
    
    const ext = filename.split('.').pop()?.toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      mp3: 'audio/mpeg',
      mp4: 'video/mp4',
      ogg: 'audio/ogg',
    };
    
    return ext ? mimeTypes[ext] : undefined;
  }

  /**
   * Convert Telegram message to SentMessage
   */
  private toSentMessage(message: TelegramMessage): SentMessage {
    return {
      messageId: message.message_id,
      chatId: message.chat.id.toString(),
      text: message.text ?? message.caption,
      date: message.date,
    };
  }
}
