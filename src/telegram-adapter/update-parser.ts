/**
 * Update Parser
 * 
 * Parses Telegram updates and normalizes them to internal format
 */

import {
  TelegramUpdate,
  TelegramMessage,
  TelegramCallbackQuery,
  ParsedMessage,
  ParsedCallback,
  MediaInfo,
} from './types';

export class UpdateParser {
  /**
   * Parse update into structured format
   */
  parseUpdate(update: TelegramUpdate): ParsedMessage | ParsedCallback | null {
    // Handle regular message
    if (update.message) {
      return this.parseMessage(update.message);
    }
    
    // Handle edited message
    if (update.edited_message) {
      return this.parseMessage(update.edited_message);
    }
    
    // Handle callback query
    if (update.callback_query) {
      return this.parseCallbackQuery(update.callback_query);
    }
    
    // Unsupported update type
    return null;
  }

  /**
   * Parse Telegram message
   */
  parseMessage(message: TelegramMessage): ParsedMessage {
    const chatId = message.chat.id.toString();
    const userId = message.from?.id.toString() ?? chatId;
    const messageId = message.message_id;
    
    // Determine message type
    let type: ParsedMessage['type'] = 'text';
    let media: MediaInfo | undefined;
    
    if (message.photo) {
      type = 'photo';
      const largestPhoto = message.photo[message.photo.length - 1];
      media = {
        fileId: largestPhoto.file_id,
        fileUniqueId: largestPhoto.file_unique_id,
        fileSize: largestPhoto.file_size,
        width: largestPhoto.width,
        height: largestPhoto.height,
      };
    } else if (message.document) {
      type = 'document';
      media = {
        fileId: message.document.file_id,
        fileUniqueId: message.document.file_unique_id,
        fileName: message.document.file_name,
        mimeType: message.document.mime_type,
        fileSize: message.document.file_size,
      };
    } else if (message.audio) {
      type = 'audio';
      media = {
        fileId: message.audio.file_id,
        fileUniqueId: message.audio.file_unique_id,
        fileName: message.audio.file_name,
        mimeType: message.audio.mime_type,
        fileSize: message.audio.file_size,
        duration: message.audio.duration,
      };
    } else if (message.video) {
      type = 'video';
      media = {
        fileId: message.video.file_id,
        fileUniqueId: message.video.file_unique_id,
        fileName: message.video.file_name,
        mimeType: message.video.mime_type,
        fileSize: message.video.file_size,
        width: message.video.width,
        height: message.video.height,
        duration: message.video.duration,
      };
    } else if (message.voice) {
      type = 'voice';
      media = {
        fileId: message.voice.file_id,
        fileUniqueId: message.voice.file_unique_id,
        mimeType: message.voice.mime_type,
        fileSize: message.voice.file_size,
        duration: message.voice.duration,
      };
    }
    
    // Extract text/caption
    const text = message.text ?? message.caption;
    
    // Check if it's a command
    let command: string | undefined;
    let commandArgs: string[] | undefined;
    
    if (text?.startsWith('/')) {
      const parsed = this.parseCommand(text);
      if (parsed) {
        type = 'command';
        command = parsed.command;
        commandArgs = parsed.args;
      }
    }
    
    // Build parsed message
    const parsed: ParsedMessage = {
      type,
      chatId,
      userId,
      messageId,
      text,
      caption: message.caption,
      media,
      command,
      commandArgs,
      replyTo: message.reply_to_message?.message_id,
      username: message.from?.username,
      displayName: this.getDisplayName(message),
      chatType: message.chat.type,
      raw: message,
    };
    
    return parsed;
  }

  /**
   * Parse callback query
   */
  parseCallbackQuery(query: TelegramCallbackQuery): ParsedCallback {
    return {
      id: query.id,
      userId: query.from.id.toString(),
      chatId: query.message?.chat.id.toString(),
      messageId: query.message?.message_id,
      data: query.data,
      from: query.from,
      raw: query,
    };
  }

  /**
   * Parse command from text
   */
  private parseCommand(text: string): { command: string; args: string[] } | null {
    const match = text.match(/^\/([a-zA-Z0-9_]+)(@[a-zA-Z0-9_]+)?\s*(.*)?$/);
    
    if (!match) {
      return null;
    }
    
    const command = match[1];
    const argsText = match[3] ?? '';
    const args = argsText ? argsText.split(/\s+/) : [];
    
    return { command, args };
  }

  /**
   * Get display name for user
   */
  private getDisplayName(message: TelegramMessage): string {
    if (!message.from) {
      return message.chat.title ?? 'Unknown';
    }
    
    const parts = [message.from.first_name];
    
    if (message.from.last_name) {
      parts.push(message.from.last_name);
    }
    
    return parts.join(' ');
  }

  /**
   * Check if message is a command
   */
  isCommand(message: TelegramMessage): boolean {
    return message.text?.startsWith('/') ?? false;
  }
}
