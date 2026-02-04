/**
 * Tests for Markdown Formatter
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { MarkdownFormatter } from '../markdown-formatter';

describe('MarkdownFormatter', () => {
  let formatter: MarkdownFormatter;
  
  beforeEach(() => {
    formatter = new MarkdownFormatter();
  });
  
  describe('formatForTelegram', () => {
    it('should convert bold markdown', () => {
      const result = formatter.formatForTelegram('**bold text**');
      expect(result).toBe('*bold text*');
    });
    
    it('should preserve code blocks', () => {
      const text = '```\nconst x = 1;\n```';
      const result = formatter.formatForTelegram(text);
      expect(result).toBe(text);
    });
    
    it('should preserve inline code', () => {
      const text = 'Use `code` here';
      const result = formatter.formatForTelegram(text);
      expect(result).toBe(text);
    });
  });
  
  describe('splitMessage', () => {
    it('should not split short messages', () => {
      const text = 'Short message';
      const chunks = formatter.splitMessage(text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });
    
    it('should split long messages at paragraph boundary', () => {
      const text = 'A'.repeat(3000) + '\n\n' + 'B'.repeat(2000);
      const chunks = formatter.splitMessage(text);
      expect(chunks.length).toBeGreaterThan(1);
    });
    
    it('should split at sentence boundary', () => {
      const text = 'A'.repeat(3000) + '. ' + 'B'.repeat(2000);
      const chunks = formatter.splitMessage(text);
      expect(chunks.length).toBeGreaterThan(1);
    });
    
    it('should respect max length', () => {
      const text = 'A'.repeat(5000);
      const chunks = formatter.splitMessage(text);
      
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(4096);
      }
    });
  });
  
  describe('escapeMarkdown', () => {
    it('should escape special characters', () => {
      const text = '_*[]()~`>#+-=|{}.!';
      const escaped = formatter.escapeMarkdown(text);
      
      // All special chars should be escaped
      expect(escaped).toContain('\\_');
      expect(escaped).toContain('\\*');
    });
  });
});
