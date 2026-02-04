/**
 * Chunker Core
 * 
 * Main chunking logic with code fence protection
 */

import type { Chunk, ChunkerConfig, Chunker as IChunker } from './types';
import { createTextBuffer } from './text-buffer';
import { createFenceTracker } from './code-fence-tracker';
import { createBreakPointFinder } from './break-point-finder';

export class Chunker implements IChunker {
  private buffer = createTextBuffer();
  private fenceTracker = createFenceTracker();
  private breakPointFinder = createBreakPointFinder();
  private config: ChunkerConfig;
  
  constructor(config: ChunkerConfig) {
    this.config = config;
  }
  
  push(text: string): Chunk[] {
    this.buffer.append(text);
    this.fenceTracker.update(text);
    
    const chunks: Chunk[] = [];
    
    // Process buffer while we have enough content
    while (this.shouldEmitChunk()) {
      const chunk = this.emitChunk();
      if (chunk) {
        chunks.push(chunk);
      } else {
        break;
      }
    }
    
    return chunks;
  }
  
  flush(): Chunk | null {
    if (this.buffer.length() === 0) {
      return null;
    }
    
    const content = this.buffer.toString();
    this.buffer.clear();
    
    return {
      content,
      breakType: 'hard',
      containsCodeFence: this.fenceTracker.isInFence(),
      isPartial: this.fenceTracker.isInFence(),
    };
  }
  
  getBufferedLength(): number {
    return this.buffer.length();
  }
  
  private shouldEmitChunk(): boolean {
    const length = this.buffer.length();
    
    // Not enough content yet
    if (length < this.config.minChars) {
      return false;
    }
    
    // Exceeded max - must emit
    if (length >= this.config.maxChars) {
      return true;
    }
    
    // In code fence and protecting - wait unless we exceed max
    if (this.config.protectCodeFences && this.fenceTracker.isInFence()) {
      return length >= this.config.maxChars;
    }
    
    // Have enough and not in fence (or not protecting) - can emit
    return true;
  }
  
  private emitChunk(): Chunk | null {
    const length = this.buffer.length();
    if (length === 0) {
      return null;
    }
    
    const text = this.buffer.peek();
    const isInFence = this.fenceTracker.isInFence();
    
    // Find break point
    let breakPos: number;
    let breakType: Chunk['breakType'];
    
    if (this.config.protectCodeFences && isInFence) {
      // In code fence - hard break at max or wait
      if (length >= this.config.maxChars) {
        breakPos = this.config.maxChars;
        breakType = 'hard';
      } else {
        return null; // Wait for fence to close
      }
    } else {
      // Find optimal break point
      const breakPoint = this.breakPointFinder.findBreakPoint(
        text,
        this.config.minChars,
        Math.min(length, this.config.maxChars)
      );
      
      if (!breakPoint) {
        return null;
      }
      
      breakPos = breakPoint.position;
      breakType = breakPoint.type;
    }
    
    // Extract chunk
    const content = this.buffer.consume(breakPos);
    
    // Update fence tracker after consuming
    this.fenceTracker.reset();
    const remaining = this.buffer.peek();
    if (remaining) {
      this.fenceTracker.update(remaining);
    }
    
    return {
      content,
      breakType,
      containsCodeFence: content.includes('```') || content.includes('~~~'),
      isPartial: false,
    };
  }
}

/**
 * Factory function to create chunker
 */
export function createChunker(config: ChunkerConfig): IChunker {
  return new Chunker(config);
}
