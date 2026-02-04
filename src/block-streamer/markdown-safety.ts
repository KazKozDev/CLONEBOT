/**
 * Markdown Safety
 * 
 * Protects markdown formatting from being broken during chunking
 */

import type { MarkdownSafety as IMarkdownSafety } from './types';

// Markdown construct patterns
const BOLD_PATTERN = /\*\*|__/g;
const ITALIC_PATTERN = /\*|_/g;
const CODE_PATTERN = /`/g;
const LINK_START = /\[/g;
const LINK_END = /\]/g;
const STRIKE_PATTERN = /~~/g;

interface MarkdownState {
  bold: number;
  italic: number;
  code: number;
  link: number;
  strike: number;
}

export class MarkdownSafety implements IMarkdownSafety {
  /**
   * Check if position is inside a markdown construct
   */
  isInMarkdownConstruct(text: string, position: number): boolean {
    const state = this.getStateAt(text, position);
    
    return (
      state.bold > 0 ||
      state.italic > 0 ||
      state.code > 0 ||
      state.link > 0 ||
      state.strike > 0
    );
  }
  
  /**
   * Find safe break point that doesn't break markdown
   */
  findSafeBreakPoint(text: string, minPos: number, maxPos: number): number {
    // Start from maxPos and work backwards to find safe position
    for (let pos = maxPos; pos >= minPos; pos--) {
      if (!this.isInMarkdownConstruct(text, pos)) {
        return pos;
      }
    }
    
    // No safe position found - return minPos
    return minPos;
  }
  
  /**
   * Close any open markdown constructs
   */
  closeOpenConstructs(text: string): string {
    const state = this.getStateAt(text, text.length);
    let closing = '';
    
    // Close in reverse order of opening
    if (state.code > 0) {
      closing += '`';
    }
    if (state.strike > 0) {
      closing += '~~';
    }
    if (state.italic > 0) {
      closing += '*';
    }
    if (state.bold > 0) {
      closing += '**';
    }
    if (state.link > 0) {
      closing += '](...)'; // Close incomplete link
    }
    
    return text + closing;
  }
  
  /**
   * Reopen constructs for continuation
   */
  reopenConstructs(text: string): string {
    const state = this.getStateAt(text, text.length);
    let opening = '';
    
    // Reopen in order
    if (state.bold > 0) {
      opening += '**';
    }
    if (state.italic > 0) {
      opening += '*';
    }
    if (state.strike > 0) {
      opening += '~~';
    }
    if (state.code > 0) {
      opening += '`';
    }
    if (state.link > 0) {
      opening += '[';
    }
    
    return opening + text;
  }
  
  /**
   * Get markdown state at position
   */
  private getStateAt(text: string, position: number): MarkdownState {
    const state: MarkdownState = {
      bold: 0,
      italic: 0,
      code: 0,
      link: 0,
      strike: 0,
    };
    
    const segment = text.slice(0, position);
    
    // Count code blocks (inline code)
    let codeCount = 0;
    let i = 0;
    while (i < segment.length) {
      if (segment[i] === '`') {
        // Check for triple backticks (code fence - ignore for inline)
        if (segment.slice(i, i + 3) === '```') {
          i += 3;
          continue;
        }
        codeCount++;
      }
      i++;
    }
    state.code = codeCount % 2;
    
    // If in code, other markdown doesn't apply
    if (state.code > 0) {
      return state;
    }
    
    // Count bold (**text**)
    const boldMatches = segment.match(/\*\*/g) || [];
    state.bold = boldMatches.length % 2;
    
    // Count italic (*text* or _text_)
    const italicMatches = segment.match(/(?<!\*)\*(?!\*)|(?<!_)_(?!_)/g) || [];
    state.italic = italicMatches.length % 2;
    
    // Count strikethrough
    const strikeMatches = segment.match(/~~/g) || [];
    state.strike = strikeMatches.length % 2;
    
    // Count links
    const linkStarts = (segment.match(/\[/g) || []).length;
    const linkEnds = (segment.match(/\]/g) || []).length;
    state.link = Math.max(0, linkStarts - linkEnds);
    
    return state;
  }
}

/**
 * Factory function to create markdown safety
 */
export function createMarkdownSafety(): IMarkdownSafety {
  return new MarkdownSafety();
}
