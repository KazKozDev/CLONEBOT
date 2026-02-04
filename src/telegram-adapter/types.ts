/**
 * Type definitions for Telegram Channel Adapter
 */

// ============================================================================
// Telegram Bot API Types
// ============================================================================

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  date: number;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  audio?: TelegramAudio;
  video?: TelegramVideo;
  voice?: TelegramVoice;
  reply_to_message?: TelegramMessage;
  entities?: TelegramMessageEntity[];
  caption_entities?: TelegramMessageEntity[];
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  thumb?: TelegramPhotoSize;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  performer?: string;
  title?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramVideo {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  duration: number;
  thumb?: TelegramPhotoSize;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
  language?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  inline_message_id?: string;
  chat_instance: string;
  data?: string;
  game_short_name?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  my_chat_member?: TelegramChatMemberUpdated;
}

export interface TelegramChatMemberUpdated {
  chat: TelegramChat;
  from: TelegramUser;
  date: number;
  old_chat_member: TelegramChatMember;
  new_chat_member: TelegramChatMember;
}

export interface TelegramChatMember {
  user: TelegramUser;
  status: string;
}

export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups: boolean;
  can_read_all_group_messages: boolean;
  supports_inline_queries: boolean;
}

export interface TelegramApiResponse<T = any> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: {
    retry_after?: number;
  };
}

// ============================================================================
// Internal Types
// ============================================================================

export interface BotInfo {
  id: number;
  username: string;
  firstName: string;
  canJoinGroups: boolean;
  canReadAllGroupMessages: boolean;
  supportsInlineQueries: boolean;
}

export interface ParsedMessage {
  type: 'text' | 'photo' | 'document' | 'audio' | 'video' | 'voice' | 'command';
  chatId: string;
  userId: string;
  messageId: number;
  text?: string;
  caption?: string;
  media?: MediaInfo;
  command?: string;
  commandArgs?: string[];
  replyTo?: number;
  username?: string;
  displayName?: string;
  chatType: 'private' | 'group' | 'supergroup' | 'channel';
  raw: TelegramMessage;
}

export interface MediaInfo {
  fileId: string;
  fileUniqueId: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  duration?: number;
}

export interface ParsedCallback {
  id: string;
  userId: string;
  chatId?: string;
  messageId?: number;
  data?: string;
  from: TelegramUser;
  raw: TelegramCallbackQuery;
}

export interface InternalMessage {
  id: string;
  channel: 'telegram';
  chatId: string;
  userId: string;
  username?: string;
  displayName?: string;
  text?: string;
  replyTo?: string;
  chatType: 'private' | 'group' | 'supergroup' | 'channel';
  timestamp: string;
  raw: TelegramMessage;
}

export interface SentMessage {
  messageId: number;
  chatId: string;
  text?: string;
  date: number;
}

export interface MessageOptions {
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  disableWebPagePreview?: boolean;
  disableNotification?: boolean;
  replyToMessageId?: number;
  replyMarkup?: ReplyMarkup;
}

export interface ReplyMarkup {
  inline_keyboard?: InlineKeyboardButton[][];
  keyboard?: KeyboardButton[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  remove_keyboard?: boolean;
}

export interface InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface KeyboardButton {
  text: string;
  request_contact?: boolean;
  request_location?: boolean;
}

export interface MediaSource {
  type: 'photo' | 'document' | 'audio' | 'video' | 'voice';
  source: string | Buffer;
  caption?: string;
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
}

export interface DownloadedFile {
  buffer: Buffer;
  filename?: string;
  mimeType?: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface TelegramAdapterConfig {
  token: string;
  mode: 'polling' | 'webhook';
  polling?: PollingConfig;
  webhook?: WebhookConfig;
  dmPolicy?: 'pairing' | 'allowlist' | 'open' | 'disabled';
  allowlist?: string[];
  streaming?: StreamingConfig;
  rateLimit?: RateLimitConfig;
  defaultParseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  typingIndicator?: boolean;
  commandPrefix?: string;
}

export interface PollingConfig {
  timeout?: number;
  interval?: number;
  allowedUpdates?: string[];
}

export interface WebhookConfig {
  url: string;
  path?: string;
  secretToken?: string;
}

export interface StreamingConfig {
  enabled?: boolean;
  minEditInterval?: number;
  maxEditsPerMessage?: number;
}

export interface RateLimitConfig {
  messagesPerSecond?: number;
  messagesPerMinutePerGroup?: number;
}

// ============================================================================
// Event Types
// ============================================================================

export type TelegramAdapterEventMap = {
  message: [ParsedMessage];
  command: [ParsedMessage];
  callback: [ParsedCallback];
  error: [Error];
  started: [];
  stopped: [];
};

export type TelegramAdapterEventType = keyof TelegramAdapterEventMap;

// ============================================================================
// Rate Limiting Types
// ============================================================================

export interface RateLimitState {
  messagesSentLastSecond: number;
  messagesSentLastMinute: number;
  lastMessageTime: number;
  chatStates: Map<string, ChatRateLimitState>;
}

export interface ChatRateLimitState {
  messagesInWindow: number;
  windowStart: number;
  isGroup: boolean;
}

export interface RateLimitStats {
  globalRate: number;
  chatRates: Map<string, number>;
}

// ============================================================================
// DM Policy Types
// ============================================================================

export interface PairingRequest {
  userId: string;
  code: string;
  timestamp: number;
  expires: number;
}

export interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
}

// ============================================================================
// Error Types
// ============================================================================

export class TelegramApiError extends Error {
  constructor(
    message: string,
    public errorCode?: number,
    public description?: string,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'TelegramApiError';
  }
}

export type ErrorAction = 'retry' | 'skip' | 'notify' | 'fatal';

// ============================================================================
// Streaming Types
// ============================================================================

export interface StreamingSenderOptions {
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  minEditInterval?: number;
  replyToMessageId?: number;
}

export interface StreamingSender {
  send(text: string): Promise<void>;
  update(text: string): Promise<void>;
  complete(): Promise<SentMessage>;
  abort(): void;
}

// ============================================================================
// Command Types
// ============================================================================

export interface CommandContext {
  message: ParsedMessage;
  command: string;
  args: string[];
}

export type CommandHandler = (context: CommandContext) => Promise<void>;

// ============================================================================
// Callback Types
// ============================================================================

export interface CallbackContext {
  query: ParsedCallback;
  data: string;
}

export type CallbackHandler = (context: CallbackContext) => Promise<void>;
