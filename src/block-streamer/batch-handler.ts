/**
 * Batch Mode Handler
 * 
 * Accumulates all text and emits blocks only on complete
 */

import type { Block, BatchHandler as IBatchHandler, ChunkerConfig } from './types';
import { createChunker } from './chunker';

export class BatchHandler implements IBatchHandler {
  private buffer: string = '';
  private config: ChunkerConfig;
  
  constructor(config: ChunkerConfig) {
    this.config = config;
  }
  
  push(text: string): void {
    this.buffer += text;
  }
  
  complete(): Block[] {
    if (this.buffer.length === 0) {
      return [];
    }
    
    // Create temporary chunker to split accumulated text
    const chunker = createChunker(this.config);
    const chunks = chunker.push(this.buffer);
    
    // Flush remaining
    const lastChunk = chunker.flush();
    if (lastChunk) {
      chunks.push(lastChunk);
    }
    
    // Convert chunks to blocks
    const blocks: Block[] = chunks.map((chunk, index) => ({
      content: chunk.content,
      index,
      isFirst: index === 0,
      isLast: index === chunks.length - 1,
      breakType: chunk.breakType,
      timestamp: Date.now(),
    }));
    
    return blocks;
  }
}

/**
 * Factory function to create batch handler
 */
export function createBatchHandler(config: ChunkerConfig): IBatchHandler {
  return new BatchHandler(config);
}
