/**
 * Block Streamer
 * 
 * Main facade class that orchestrates all components
 */

import type {
  BlockStreamerOptions,
  BlockStreamerConfig,
  StreamerState,
  StreamerStats,
  StreamingMode,
  ChannelProfile,
  Block,
  StreamingUpdate,
  CompleteSummary,
  ChunkerConfig,
  CoalescerConfig,
  StreamingHandlerConfig,
} from './types';
import { getProfile } from './channel-profiles';
import { createBlockHandler } from './block-handler';
import { createStreamingHandler } from './streaming-handler';
import { createBatchHandler } from './batch-handler';
import { createLineCounter } from './line-counter';
import { createMarkdownSafety } from './markdown-safety';

const DEFAULT_CONFIG: BlockStreamerConfig = {
  defaultProfile: 'web',
  defaultMode: 'block',
  defaultMinChars: 100,
  defaultMaxChars: 4096,
  protectCodeFences: true,
  maxCodeFenceSize: 50000,
  enableCoalescing: true,
  defaultCoalesceGap: 200,
  protectMarkdown: true,
  autoCloseConstructs: true,
  bufferImplementation: 'string',
};

export class BlockStreamer {
  private profile: ChannelProfile;
  private mode: StreamingMode;
  private config: BlockStreamerConfig;
  
  // Callbacks
  private onBlockCallback?: (block: Block) => void;
  private onUpdateCallback?: (update: StreamingUpdate) => void;
  private onCompleteCallback?: (summary: CompleteSummary) => void;
  private onErrorCallback?: (error: Error) => void;
  
  // Handlers
  private blockHandler?: ReturnType<typeof createBlockHandler>;
  private streamingHandler?: ReturnType<typeof createStreamingHandler>;
  private batchHandler?: ReturnType<typeof createBatchHandler>;
  private lineCounter = createLineCounter();
  private markdownSafety = createMarkdownSafety();
  
  // State
  private state: StreamerState;
  private stats: StreamerStats;
  
  constructor(options: BlockStreamerOptions = {}, config: Partial<BlockStreamerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Determine profile
    if (typeof options.profile === 'string') {
      this.profile = getProfile(options.profile);
    } else if (options.profile) {
      this.profile = options.profile;
    } else {
      this.profile = getProfile(this.config.defaultProfile);
    }
    
    // Determine mode
    this.mode = options.mode || this.profile.defaultMode;
    
    // Set callbacks
    this.onBlockCallback = options.onBlock;
    this.onUpdateCallback = options.onUpdate;
    this.onCompleteCallback = options.onComplete;
    this.onErrorCallback = options.onError;
    
    // Initialize state
    this.state = {
      bufferedChars: 0,
      emittedBlocks: 0,
      mode: this.mode,
      isInCodeFence: false,
      isComplete: false,
      isAborted: false,
    };
    
    this.stats = {
      totalInputChars: 0,
      totalOutputBlocks: 0,
      totalOutputChars: 0,
      avgBlockSize: 0,
      duration: 0,
      startTime: null,
      endTime: null,
    };
    
    // Initialize appropriate handler
    this.initializeHandler();
  }
  
  /**
   * Push text into the streamer
   */
  push(text: string): void {
    if (this.state.isComplete || this.state.isAborted) {
      const error = new Error('Cannot push to completed or aborted streamer');
      if (this.onErrorCallback) {
        this.onErrorCallback(error);
        return; // Don't throw if callback handles it
      }
      throw error;
    }
    
    if (this.stats.startTime === null) {
      this.stats.startTime = Date.now();
    }
    
    this.stats.totalInputChars += text.length;
    
    try {
      switch (this.mode) {
        case 'block':
          this.handleBlockMode(text);
          break;
        case 'streaming':
          this.handleStreamingMode(text);
          break;
        case 'batch':
          this.handleBatchMode(text);
          break;
      }
    } catch (error) {
      if (this.onErrorCallback) {
        this.onErrorCallback(error as Error);
      } else {
        throw error;
      }
    }
  }
  
  /**
   * Flush any buffered content
   */
  flush(): void {
    if (this.mode === 'block' && this.blockHandler) {
      const block = this.blockHandler.flush();
      if (block) {
        this.emitBlock(block);
      }
    }
  }
  
  /**
   * Complete the stream
   */
  complete(): void {
    if (this.state.isComplete || this.state.isAborted) {
      return;
    }
    
    this.stats.endTime = Date.now();
    if (this.stats.startTime === null) {
      this.stats.startTime = this.stats.endTime;
    }
    this.stats.duration = this.stats.endTime - this.stats.startTime;
    
    try {
      switch (this.mode) {
        case 'block':
          if (this.blockHandler) {
            const block = this.blockHandler.complete();
            if (block) {
              block.isLast = true;
              this.emitBlock(block);
            } else if (this.state.emittedBlocks > 0) {
              // Mark last emitted block as last
              // Note: Already emitted, can't modify retroactively
            }
          }
          break;
          
        case 'streaming':
          if (this.streamingHandler) {
            const update = this.streamingHandler.complete();
            this.emitUpdate(update);
          }
          break;
          
        case 'batch':
          if (this.batchHandler) {
            const blocks = this.batchHandler.complete();
            blocks.forEach((block, index) => {
              if (index === blocks.length - 1) {
                block.isLast = true;
              }
              this.emitBlock(block);
            });
          }
          break;
      }
      
      this.state.isComplete = true;
      
      // Emit completion summary
      if (this.onCompleteCallback) {
        this.onCompleteCallback({
          totalBlocks: this.stats.totalOutputBlocks,
          totalChars: this.stats.totalOutputChars,
          duration: this.stats.duration,
        });
      }
    } catch (error) {
      if (this.onErrorCallback) {
        this.onErrorCallback(error as Error);
      } else {
        throw error;
      }
    }
  }
  
  /**
   * Abort the stream without emitting remaining content
   */
  abort(): void {
    this.state.isAborted = true;
    this.state.isComplete = true;
  }
  
  /**
   * Get current state
   */
  getState(): StreamerState {
    return { ...this.state };
  }
  
  /**
   * Get statistics
   */
  getStats(): StreamerStats {
    return { ...this.stats };
  }
  
  /**
   * Change channel profile mid-stream
   */
  setProfile(profileName: string): void {
    this.profile = getProfile(profileName);
    this.reconfigure();
  }
  
  /**
   * Update configuration
   */
  configure(options: Partial<BlockStreamerOptions>): void {
    if (options.mode && options.mode !== this.mode) {
      this.mode = options.mode;
      this.state.mode = this.mode;
      this.initializeHandler();
    }
    
    if (options.profile) {
      if (typeof options.profile === 'string') {
        this.setProfile(options.profile);
      } else {
        this.profile = options.profile;
        this.reconfigure();
      }
    }
    
    if (options.onBlock) this.onBlockCallback = options.onBlock;
    if (options.onUpdate) this.onUpdateCallback = options.onUpdate;
    if (options.onComplete) this.onCompleteCallback = options.onComplete;
    if (options.onError) this.onErrorCallback = options.onError;
  }
  
  // ========================================================================
  // Private Methods
  // ========================================================================
  
  private initializeHandler(): void {
    const chunkerConfig = this.getChunkerConfig();
    const coalescerConfig = this.getCoalescerConfig();
    const streamingConfig = this.getStreamingConfig();
    
    switch (this.mode) {
      case 'block':
        this.blockHandler = createBlockHandler(
          chunkerConfig,
          coalescerConfig,
          this.config.enableCoalescing
        );
        break;
        
      case 'streaming':
        this.streamingHandler = createStreamingHandler(streamingConfig);
        break;
        
      case 'batch':
        this.batchHandler = createBatchHandler(chunkerConfig);
        break;
    }
  }
  
  private reconfigure(): void {
    this.initializeHandler();
  }
  
  private getChunkerConfig(): ChunkerConfig {
    return {
      minChars: this.profile.minChars,
      maxChars: this.profile.maxChars || this.config.defaultMaxChars,
      protectCodeFences: this.config.protectCodeFences,
    };
  }
  
  private getCoalescerConfig(): CoalescerConfig {
    return {
      minCoalesceSize: this.profile.minChars,
      maxCoalesceSize: this.profile.maxChars || this.config.defaultMaxChars,
      gapMs: this.profile.coalesceGap,
    };
  }
  
  private getStreamingConfig(): StreamingHandlerConfig {
    return {
      throttleMs: this.profile.coalesceGap,
      immediate: this.profile.coalesceGap === 0,
    };
  }
  
  private handleBlockMode(text: string): void {
    if (!this.blockHandler) return;
    
    const blocks = this.blockHandler.push(text);
    blocks.forEach(block => this.emitBlock(block));
  }
  
  private handleStreamingMode(text: string): void {
    if (!this.streamingHandler) return;
    
    const update = this.streamingHandler.push(text);
    if (update) {
      this.emitUpdate(update);
    }
  }
  
  private handleBatchMode(text: string): void {
    if (!this.batchHandler) return;
    
    this.batchHandler.push(text);
  }
  
  private emitBlock(block: Block): void {
    this.state.emittedBlocks++;
    this.stats.totalOutputBlocks++;
    this.stats.totalOutputChars += block.content.length;
    this.stats.avgBlockSize = this.stats.totalOutputChars / this.stats.totalOutputBlocks;
    
    if (this.onBlockCallback) {
      this.onBlockCallback(block);
    }
  }
  
  private emitUpdate(update: StreamingUpdate): void {
    if (this.onUpdateCallback) {
      this.onUpdateCallback(update);
    }
  }
}

/**
 * Factory function to create block streamer
 */
export function createBlockStreamer(
  options?: BlockStreamerOptions,
  config?: Partial<BlockStreamerConfig>
): BlockStreamer {
  return new BlockStreamer(options, config);
}
