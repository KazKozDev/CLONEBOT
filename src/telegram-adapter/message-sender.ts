/**
 * Message Sender
 * 
 * Handles sending and editing messages in Telegram
 */

import { TelegramApiClient } from './api-client';
import { 
  SentMessage, 
  MessageOptions, 
  TelegramMessage,
  TelegramApiError 
} from './types';

export class MessageSender {
  constructor(private apiClient: TelegramApiClient) {}

  /**
   * Send a text message
   */
  async send(
    chatId: string | number,
    text: string,
    options: MessageOptions = {}
  ): Promise<SentMessage> {
    const params: any = {
      chat_id: chatId,
      text,
    };
    
    if (options.parseMode) {
      params.parse_mode = options.parseMode;
    }
    
    if (options.disableWebPagePreview) {
      params.disable_web_page_preview = true;
    }
    
    if (options.disableNotification) {
      params.disable_notification = true;
    }
    
    if (options.replyToMessageId) {
      params.reply_to_message_id = options.replyToMessageId;
    }
    
    if (options.replyMarkup) {
      params.reply_markup = options.replyMarkup;
    }
    
    const result = await this.apiClient.call<TelegramMessage>('sendMessage', params);
    
    return this.toSentMessage(result);
  }

  /**
   * Edit message text
   */
  async edit(
    chatId: string | number,
    messageId: number,
    text: string,
    options: MessageOptions = {}
  ): Promise<SentMessage> {
    const params: any = {
      chat_id: chatId,
      message_id: messageId,
      text,
    };
    
    if (options.parseMode) {
      params.parse_mode = options.parseMode;
    }
    
    if (options.disableWebPagePreview) {
      params.disable_web_page_preview = true;
    }
    
    if (options.replyMarkup) {
      params.reply_markup = options.replyMarkup;
    }
    
    try {
      const result = await this.apiClient.call<TelegramMessage>('editMessageText', params);
      return this.toSentMessage(result);
    } catch (error) {
      // Handle "message is not modified" error gracefully
      if (this.isNotModifiedError(error)) {
        // Return existing message info
        return {
          messageId,
          chatId: chatId.toString(),
          text,
          date: Date.now() / 1000,
        };
      }
      throw error;
    }
  }

  /**
   * Delete a message
   */
  async delete(chatId: string | number, messageId: number): Promise<boolean> {
    try {
      await this.apiClient.call('deleteMessage', {
        chat_id: chatId,
        message_id: messageId,
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Send chat action (typing indicator, etc.)
   */
  async sendAction(
    chatId: string | number,
    action: 'typing' | 'upload_photo' | 'upload_document' | 'upload_video' | 'upload_audio'
  ): Promise<void> {
    await this.apiClient.call('sendChatAction', {
      chat_id: chatId,
      action,
    });
  }

  /**
   * Answer callback query
   */
  async answerCallback(
    queryId: string,
    options: {
      text?: string;
      showAlert?: boolean;
      url?: string;
      cacheTime?: number;
    } = {}
  ): Promise<void> {
    await this.apiClient.call('answerCallbackQuery', {
      callback_query_id: queryId,
      ...options,
    });
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

  /**
   * Check if error is "message not modified"
   */
  private isNotModifiedError(error: any): boolean {
    return (
      error instanceof TelegramApiError &&
      (error.description?.includes('message is not modified') ?? false)
    );
  }
}
