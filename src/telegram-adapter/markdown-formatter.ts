/**
 * Markdown Formatter
 * 
 * Converts Markdown to Telegram-compatible format
 */

export class MarkdownFormatter {
  /**
   * Format text for Telegram
   */
  formatForTelegram(text: string, sourceFormat: 'markdown' | 'html' = 'markdown'): string {
    if (sourceFormat === 'html') {
      // HTML is already compatible with Telegram
      return text;
    }
    
    // Convert standard Markdown to Telegram Markdown
    return this.convertMarkdown(text);
  }

  /**
   * Convert standard Markdown to Telegram Markdown
   */
  private convertMarkdown(text: string): string {
    // Telegram uses different Markdown syntax:
    // - Single asterisk for bold (not double)
    // - Underscore for italic
    // - Backtick for code
    // - Triple backtick for code blocks
    
    let result = text;
    
    // Convert **bold** to *bold*
    result = result.replace(/\*\*(.+?)\*\*/g, '*$1*');
    
    // Convert __italic__ to _italic_
    result = result.replace(/__(.+?)__/g, '_$1_');
    
    // Preserve code blocks (already compatible)
    // ```code``` is compatible
    
    // Preserve inline code (already compatible)
    // `code` is compatible
    
    // Handle links [text](url) - compatible
    
    return result;
  }

  /**
   * Escape special Markdown characters
   */
  escapeMarkdown(text: string): string {
    // Telegram MarkdownV2 requires escaping these characters
    const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
    
    let escaped = text;
    
    for (const char of specialChars) {
      escaped = escaped.replace(new RegExp('\\' + char, 'g'), '\\' + char);
    }
    
    return escaped;
  }

  /**
   * Get parse mode for format type
   */
  parseMode(format: 'markdown' | 'html' | 'markdownv2'): 'Markdown' | 'MarkdownV2' | 'HTML' {
    switch (format) {
      case 'markdown':
        return 'Markdown';
      case 'markdownv2':
        return 'MarkdownV2';
      case 'html':
        return 'HTML';
      default:
        return 'Markdown';
    }
  }

  /**
   * Split long message into chunks
   */
  splitMessage(text: string, maxLength: number = 4096): string[] {
    if (text.length <= maxLength) {
      return [text];
    }
    
    const chunks: string[] = [];
    let remaining = text;
    
    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }
      
      // Find a good split point (paragraph, sentence, or word boundary)
      let splitPoint = this.findSplitPoint(remaining, maxLength);
      
      chunks.push(remaining.substring(0, splitPoint));
      remaining = remaining.substring(splitPoint).trim();
    }
    
    return chunks;
  }

  /**
   * Find good split point for message
   */
  private findSplitPoint(text: string, maxLength: number): number {
    // Try to split at paragraph boundary
    const paragraphEnd = text.lastIndexOf('\n\n', maxLength);
    if (paragraphEnd > maxLength * 0.5) {
      return paragraphEnd + 2;
    }
    
    // Try to split at sentence boundary
    const sentenceEnd = this.findLastSentenceEnd(text, maxLength);
    if (sentenceEnd > maxLength * 0.5) {
      return sentenceEnd + 1;
    }
    
    // Try to split at word boundary
    const spacePos = text.lastIndexOf(' ', maxLength);
    if (spacePos > maxLength * 0.5) {
      return spacePos + 1;
    }
    
    // Split at max length
    return maxLength;
  }

  /**
   * Find last sentence end before position
   */
  private findLastSentenceEnd(text: string, maxPos: number): number {
    const sentenceEnders = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
    let lastEnd = -1;
    
    for (const ender of sentenceEnders) {
      const pos = text.lastIndexOf(ender, maxPos);
      if (pos > lastEnd) {
        lastEnd = pos;
      }
    }
    
    return lastEnd;
  }

  /**
   * Preserve code blocks during formatting
   */
  preserveCodeBlocks(text: string, processor: (text: string) => string): string {
    const codeBlocks: string[] = [];
    let blockIndex = 0;
    
    // Extract code blocks
    let result = text.replace(/```[\s\S]*?```/g, (match) => {
      codeBlocks.push(match);
      return `__CODE_BLOCK_${blockIndex++}__`;
    });
    
    // Process non-code text
    result = processor(result);
    
    // Restore code blocks
    for (let i = 0; i < codeBlocks.length; i++) {
      result = result.replace(`__CODE_BLOCK_${i}__`, codeBlocks[i]);
    }
    
    return result;
  }

  /**
   * Preserve inline code during formatting
   */
  preserveInlineCode(text: string, processor: (text: string) => string): string {
    const inlineCodes: string[] = [];
    let codeIndex = 0;
    
    // Extract inline code
    let result = text.replace(/`[^`]+`/g, (match) => {
      inlineCodes.push(match);
      return `__INLINE_CODE_${codeIndex++}__`;
    });
    
    // Process non-code text
    result = processor(result);
    
    // Restore inline code
    for (let i = 0; i < inlineCodes.length; i++) {
      result = result.replace(`__INLINE_CODE_${i}__`, inlineCodes[i]);
    }
    
    return result;
  }
}
