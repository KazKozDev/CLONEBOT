/**
 * Block Mode Handler
 * 
 * Main block mode - emits complete blocks as they're ready
 */

import type { Block, BlockHandler as IBlockHandler, ChunkerConfig, CoalescerConfig } from './types';
import { createChunker } from './chunker';
import { createCoalescer } from './coalescer';

export class BlockHandler implements IBlockHandler {
  private chunker;
  private coalescer;
  private blockIndex: number = 0;
  private isFirstEmitted: boolean = false;
  private lastEmittedBlock: Block | null = null;
  private enableCoalescing: boolean;
  
  constructor(chunkerConfig: ChunkerConfig, coalescerConfig: CoalescerConfig, enableCoalescing: boolean = true) {
    this.chunker = createChunker(chunkerConfig);
    this.coalescer = createCoalescer(coalescerConfig);
    this.enableCoalescing = enableCoalescing;
  }
  
  push(text: string): Block[] {
    const chunks = this.chunker.push(text);
    const blocks: Block[] = [];
    
    for (const chunk of chunks) {
      if (this.enableCoalescing) {
        const coalescedChunk = this.coalescer.push(chunk);
        if (coalescedChunk) {
          const block = this.createBlock(coalescedChunk.content, chunk.breakType);
          blocks.push(block);
          this.lastEmittedBlock = block;
        }
      } else {
        const block = this.createBlock(chunk.content, chunk.breakType);
        blocks.push(block);
        this.lastEmittedBlock = block;
      }
    }
    
    return blocks;
  }
  
  flush(): Block | null {
    // Flush coalescer first
    const coalescedChunk = this.coalescer.flush();
    if (coalescedChunk) {
      return this.createBlock(coalescedChunk.content, 'hard');
    }
    
    // Then flush chunker
    const chunk = this.chunker.flush();
    if (chunk) {
      return this.createBlock(chunk.content, chunk.breakType);
    }
    
    return null;
  }
  
  complete(): Block | null {
    const block = this.flush();
    if (block) {
      block.isLast = true;
      this.lastEmittedBlock = block;
      return block;
    }
    
    // Mark last emitted block as last
    if (this.lastEmittedBlock) {
      this.lastEmittedBlock.isLast = true;
    }
    
    return null;
  }
  
  private createBlock(content: string, breakType: Block['breakType']): Block {
    const block: Block = {
      content,
      index: this.blockIndex++,
      isFirst: !this.isFirstEmitted,
      isLast: false, // Will be set by caller on complete
      breakType,
      timestamp: Date.now(),
    };
    
    this.isFirstEmitted = true;
    
    return block;
  }
}

/**
 * Factory function to create block handler
 */
export function createBlockHandler(
  chunkerConfig: ChunkerConfig,
  coalescerConfig: CoalescerConfig,
  enableCoalescing: boolean = true
): IBlockHandler {
  return new BlockHandler(chunkerConfig, coalescerConfig, enableCoalescing);
}
