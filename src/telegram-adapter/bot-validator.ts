/**
 * Bot Validator
 * 
 * Validates bot token and retrieves bot information
 */

import { TelegramApiClient } from './api-client';
import { TelegramBotInfo, BotInfo } from './types';

export class BotValidator {
  private botInfo: BotInfo | null = null;

  constructor(private apiClient: TelegramApiClient) {}

  /**
   * Validate bot token and get bot information
   */
  async validateToken(token: string): Promise<BotInfo> {
    try {
      const result = await this.apiClient.call<TelegramBotInfo>('getMe');
      
      this.botInfo = {
        id: result.id,
        username: result.username,
        firstName: result.first_name,
        canJoinGroups: result.can_join_groups,
        canReadAllGroupMessages: result.can_read_all_group_messages,
        supportsInlineQueries: result.supports_inline_queries,
      };
      
      return this.botInfo;
    } catch (error) {
      throw new Error(`Failed to validate bot token: ${(error as Error).message}`);
    }
  }

  /**
   * Get cached bot info
   */
  getBotInfo(): BotInfo {
    if (!this.botInfo) {
      throw new Error('Bot not validated. Call validateToken() first.');
    }
    return this.botInfo;
  }

  /**
   * Get bot username
   */
  getBotUsername(): string {
    return this.getBotInfo().username;
  }
}
