/**
 * Coalescer
 * 
 * Coalesces small chunks into larger blocks
 */

import type { Chunk, CoalescedChunk, CoalescerConfig, Coalescer as ICoalescer } from './types';

export class Coalescer implements ICoalescer {
  private config: CoalescerConfig;
  private pendingChunk: Chunk | null = null;
  private pendingTimestamp: number = 0;
  private timeoutHandle: NodeJS.Timeout | null = null;
  
  constructor(config: CoalescerConfig) {
    this.config = config;
  }
  
  push(chunk: Chunk): CoalescedChunk | null {
    const now = Date.now();
    
    // If chunk is large enough, send it immediately
    if (chunk.content.length >= this.config.minCoalesceSize) {
      const result = this.flushPending();
      
      // Return the large chunk
      const largeChunk: CoalescedChunk = {
        content: chunk.content,
        parts: [chunk],
        coalesced: false,
      };
      
      // If we had pending, we need to return both
      if (result) {
        // This is tricky - we can only return one
        // Store the large chunk for next call
        this.pendingChunk = chunk;
        this.pendingTimestamp = now;
        return result;
      }
      
      return largeChunk;
    }
    
    // Small chunk - try to coalesce
    if (this.pendingChunk) {
      const timeSincePending = now - this.pendingTimestamp;
      
      // Check if we should coalesce with pending
      const combined = this.pendingChunk.content + chunk.content;
      const shouldCoalesce = 
        timeSincePending <= this.config.gapMs &&
        combined.length <= this.config.maxCoalesceSize;
      
      if (shouldCoalesce) {
        // Merge with pending
        this.pendingChunk = {
          content: combined,
          breakType: chunk.breakType,
          containsCodeFence: this.pendingChunk.containsCodeFence || chunk.containsCodeFence,
          isPartial: chunk.isPartial,
        };
        this.pendingTimestamp = now;
        
        // Reset timeout
        this.resetTimeout();
        
        return null; // Still pending
      } else {
        // Gap too large or combined too big - flush pending
        const result = this.flushPending();
        
        // Store new chunk as pending
        this.pendingChunk = chunk;
        this.pendingTimestamp = now;
        this.resetTimeout();
        
        return result;
      }
    } else {
      // No pending - store this chunk
      this.pendingChunk = chunk;
      this.pendingTimestamp = now;
      this.resetTimeout();
      
      return null;
    }
  }
  
  flush(): CoalescedChunk | null {
    this.clearTimeout();
    return this.flushPending();
  }
  
  private flushPending(): CoalescedChunk | null {
    if (!this.pendingChunk) {
      return null;
    }
    
    const result: CoalescedChunk = {
      content: this.pendingChunk.content,
      parts: [this.pendingChunk],
      coalesced: false, // Single chunk, not coalesced
    };
    
    this.pendingChunk = null;
    this.pendingTimestamp = 0;
    
    return result;
  }
  
  private resetTimeout(): void {
    this.clearTimeout();
    
    if (this.config.gapMs > 0) {
      this.timeoutHandle = setTimeout(() => {
        // Gap timeout - flush pending
        const result = this.flushPending();
        if (result) {
          // Note: We can't emit this directly in timeout
          // The caller needs to call flush() periodically
        }
      }, this.config.gapMs);
    }
  }
  
  private clearTimeout(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }
}

/**
 * Factory function to create coalescer
 */
export function createCoalescer(config: CoalescerConfig): ICoalescer {
  return new Coalescer(config);
}
