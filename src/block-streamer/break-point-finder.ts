/**
 * Break Point Finder
 * 
 * Finds optimal text breaking points based on priority
 */

import type { BreakPoint, BreakPointType, BreakPointFinder as IBreakPointFinder } from './types';

const BREAK_PRIORITIES: Record<BreakPointType, number> = {
  paragraph: 1,
  sentence: 2,
  line: 3,
  clause: 4,
  word: 5,
  hard: 6,
};

// Break point patterns (in order of priority)
const PARAGRAPH_PATTERN = /\n\s*\n/g;
const SENTENCE_PATTERN = /[.!?]\s+/g;
const LINE_PATTERN = /\n/g;
const CLAUSE_PATTERN = /[,;:]\s+/g;
const WORD_PATTERN = /\s+/g;

export class BreakPointFinder implements IBreakPointFinder {
  findBreakPoint(text: string, minPos: number, maxPos: number): BreakPoint | null {
    // Ensure valid range
    if (minPos >= maxPos || minPos >= text.length) {
      return null;
    }
    
    const searchText = text.slice(0, maxPos);
    
    // Try each break type in priority order
    const breakPoint = 
      this.findParagraphBreak(searchText, minPos) ||
      this.findSentenceBreak(searchText, minPos) ||
      this.findLineBreak(searchText, minPos) ||
      this.findClauseBreak(searchText, minPos) ||
      this.findWordBreak(searchText, minPos) ||
      this.findHardBreak(maxPos);
    
    return breakPoint;
  }
  
  private findParagraphBreak(text: string, minPos: number): BreakPoint | null {
    return this.findPatternBreak(text, PARAGRAPH_PATTERN, minPos, 'paragraph');
  }
  
  private findSentenceBreak(text: string, minPos: number): BreakPoint | null {
    return this.findPatternBreak(text, SENTENCE_PATTERN, minPos, 'sentence');
  }
  
  private findLineBreak(text: string, minPos: number): BreakPoint | null {
    return this.findPatternBreak(text, LINE_PATTERN, minPos, 'line');
  }
  
  private findClauseBreak(text: string, minPos: number): BreakPoint | null {
    return this.findPatternBreak(text, CLAUSE_PATTERN, minPos, 'clause');
  }
  
  private findWordBreak(text: string, minPos: number): BreakPoint | null {
    return this.findPatternBreak(text, WORD_PATTERN, minPos, 'word');
  }
  
  private findHardBreak(maxPos: number): BreakPoint {
    return {
      position: maxPos,
      type: 'hard',
      priority: BREAK_PRIORITIES.hard,
    };
  }
  
  private findPatternBreak(
    text: string,
    pattern: RegExp,
    minPos: number,
    type: BreakPointType
  ): BreakPoint | null {
    // Reset regex state
    pattern.lastIndex = 0;
    
    let bestMatch: RegExpExecArray | null = null;
    let match: RegExpExecArray | null;
    
    while ((match = pattern.exec(text)) !== null) {
      const breakPos = match.index + match[0].length;
      
      // Must be after minPos
      if (breakPos >= minPos) {
        bestMatch = match;
        // Take the first valid match (closest to minPos)
        break;
      }
    }
    
    if (bestMatch) {
      const breakPos = bestMatch.index + bestMatch[0].length;
      return {
        position: breakPos,
        type,
        priority: BREAK_PRIORITIES[type],
      };
    }
    
    return null;
  }
}

/**
 * Factory function to create break point finder
 */
export function createBreakPointFinder(): IBreakPointFinder {
  return new BreakPointFinder();
}
