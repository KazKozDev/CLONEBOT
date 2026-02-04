/**
 * Code Fence Tracker
 * 
 * Tracks code fence state (``` or ~~~) in streaming text
 */

import type { FenceTracker, CodeFenceInfo } from './types';

const FENCE_MARKERS = ['```', '~~~'] as const;
const INLINE_CODE = '`';

export class CodeFenceTrackerImpl implements FenceTracker {
  private inFence: boolean = false;
  private currentFence: CodeFenceInfo | null = null;
  private processedText: string = '';
  
  update(text: string): void {
    this.processedText += text;
    this.scanForFences();
  }
  
  isInFence(): boolean {
    return this.inFence;
  }
  
  getFenceInfo(): CodeFenceInfo | null {
    return this.currentFence;
  }
  
  reset(): void {
    this.inFence = false;
    this.currentFence = null;
    this.processedText = '';
  }
  
  private scanForFences(): void {
    const lines = this.processedText.split('\n');
    let inFence = false;
    let fenceMarker: '```' | '~~~' | null = null;
    let fenceStart = -1;
    let language: string | undefined;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check for fence markers
      for (const marker of FENCE_MARKERS) {
        if (line.startsWith(marker)) {
          if (!inFence) {
            // Opening fence
            inFence = true;
            fenceMarker = marker;
            fenceStart = this.getLinePosition(lines, i);
            
            // Extract language if present
            const rest = line.slice(marker.length).trim();
            language = rest.length > 0 ? rest : undefined;
          } else if (fenceMarker === marker) {
            // Closing fence (must match opening marker)
            inFence = false;
            fenceMarker = null;
            fenceStart = -1;
            language = undefined;
          }
          break;
        }
      }
    }
    
    this.inFence = inFence;
    if (inFence && fenceMarker) {
      this.currentFence = {
        marker: fenceMarker,
        startIndex: fenceStart,
        language,
      };
    } else {
      this.currentFence = null;
    }
  }
  
  private getLinePosition(lines: string[], lineIndex: number): number {
    let position = 0;
    for (let i = 0; i < lineIndex; i++) {
      position += lines[i].length + 1; // +1 for newline
    }
    return position;
  }
}

/**
 * Factory function to create fence tracker
 */
export function createFenceTracker(): FenceTracker {
  return new CodeFenceTrackerImpl();
}
