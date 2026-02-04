/**
 * Tests for Update Parser
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { UpdateParser } from '../update-parser';
import { TelegramMessage } from '../types';

describe('UpdateParser', () => {
  let parser: UpdateParser;
  
  beforeEach(() => {
    parser = new UpdateParser();
  });
  
  describe('parseMessage', () => {
    it('should parse text message', () => {
      const message: TelegramMessage = {
        message_id: 1,
        from: {
          id: 123,
          is_bot: false,
          first_name: 'John',
          username: 'john_doe',
        },
        chat: {
          id: 123,
          type: 'private',
          first_name: 'John',
        },
        date: Date.now() / 1000,
        text: 'Hello!',
      };
      
      const parsed = parser.parseMessage(message);
      
      expect(parsed.type).toBe('text');
      expect(parsed.text).toBe('Hello!');
      expect(parsed.userId).toBe('123');
      expect(parsed.chatId).toBe('123');
      expect(parsed.chatType).toBe('private');
    });
    
    it('should parse command message', () => {
      const message: TelegramMessage = {
        message_id: 1,
        from: {
          id: 123,
          is_bot: false,
          first_name: 'John',
        },
        chat: {
          id: 123,
          type: 'private',
        },
        date: Date.now() / 1000,
        text: '/start',
      };
      
      const parsed = parser.parseMessage(message);
      
      expect(parsed.type).toBe('command');
      expect(parsed.command).toBe('start');
      expect(parsed.commandArgs).toEqual([]);
    });
    
    it('should parse command with arguments', () => {
      const message: TelegramMessage = {
        message_id: 1,
        from: {
          id: 123,
          is_bot: false,
          first_name: 'John',
        },
        chat: {
          id: 123,
          type: 'private',
        },
        date: Date.now() / 1000,
        text: '/echo hello world',
      };
      
      const parsed = parser.parseMessage(message);
      
      expect(parsed.type).toBe('command');
      expect(parsed.command).toBe('echo');
      expect(parsed.commandArgs).toEqual(['hello', 'world']);
    });
    
    it('should parse photo message', () => {
      const message: TelegramMessage = {
        message_id: 1,
        from: {
          id: 123,
          is_bot: false,
          first_name: 'John',
        },
        chat: {
          id: 123,
          type: 'private',
        },
        date: Date.now() / 1000,
        photo: [
          {
            file_id: 'photo_id',
            file_unique_id: 'unique_id',
            width: 100,
            height: 100,
          },
        ],
        caption: 'Look at this!',
      };
      
      const parsed = parser.parseMessage(message);
      
      expect(parsed.type).toBe('photo');
      expect(parsed.caption).toBe('Look at this!');
      expect(parsed.media).toBeDefined();
      expect(parsed.media?.fileId).toBe('photo_id');
    });
  });
});
