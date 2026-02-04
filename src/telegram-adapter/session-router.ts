/**
 * Session Router
 * 
 * Routes messages to appropriate agent sessions
 */

import { ParsedMessage } from './types';

export class SessionRouter {
  constructor(private agentId: string = 'default') {}

  /**
   * Get session key for message
   */
  getSessionKey(message: ParsedMessage): string {
    if (this.isGroupChat(message)) {
      // Group chats get their own session
      return `agent:${this.agentId}:telegram:group:${message.chatId}`;
    } else {
      // Private chats are per-user
      return `agent:${this.agentId}:telegram:user:${message.userId}`;
    }
  }

  /**
   * Check if message is from group chat
   */
  isGroupChat(message: ParsedMessage): boolean {
    return message.chatType === 'group' || message.chatType === 'supergroup';
  }

  /**
   * Get user ID from message
   */
  getUserId(message: ParsedMessage): string {
    return message.userId;
  }

  /**
   * Get chat ID from message
   */
  getChatId(message: ParsedMessage): string {
    return message.chatId;
  }

  /**
   * Check if message is in channel
   */
  isChannel(message: ParsedMessage): boolean {
    return message.chatType === 'channel';
  }

  /**
   * Check if message is private
   */
  isPrivate(message: ParsedMessage): boolean {
    return message.chatType === 'private';
  }
}
