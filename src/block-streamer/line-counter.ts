/**
 * Line Counter
 * 
 * Counts lines in text for channels with line limits
 */

import type { LineCounter as ILineCounter } from './types';

export class LineCounter implements ILineCounter {
  /**
   * Count lines in text
   * Empty string = 0 lines
   * Text without newlines = 1 line
   */
  countLines(text: string): number {
    if (text.length === 0) {
      return 0;
    }
    
    // Count newlines + 1
    const newlines = (text.match(/\n/g) || []).length;
    return newlines + 1;
  }
  
  /**
   * Count lines with word wrapping at maxWidth
   */
  countLinesWithWrap(text: string, maxWidth: number): number {
    if (text.length === 0) {
      return 0;
    }
    
    if (maxWidth <= 0) {
      throw new Error('maxWidth must be > 0');
    }
    
    const lines = text.split('\n');
    let totalLines = 0;
    
    for (const line of lines) {
      if (line.length === 0) {
        totalLines += 1;
      } else {
        // Calculate wrapped lines
        totalLines += Math.ceil(line.length / maxWidth);
      }
    }
    
    return totalLines;
  }
  
  /**
   * Find position where we exceed maxLines
   * Returns position to cut, or text.length if within limit
   */
  findLineBreakPosition(text: string, maxLines: number): number {
    if (maxLines <= 0) {
      return 0;
    }
    
    const lines = text.split('\n');
    
    if (lines.length <= maxLines) {
      return text.length;
    }
    
    // Find position of maxLines'th newline
    let position = 0;
    let lineCount = 0;
    
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') {
        lineCount++;
        if (lineCount >= maxLines) {
          return i;
        }
      }
    }
    
    return text.length;
  }
}

/**
 * Factory function to create line counter
 */
export function createLineCounter(): ILineCounter {
  return new LineCounter();
}
