/**
 * Streaming Mode Handler
 * 
 * Handles streaming mode - accumulates full content and sends delta updates
 */

import type { StreamingUpdate, StreamingHandler as IStreamingHandler, StreamingHandlerConfig } from './types';

export class StreamingHandler implements IStreamingHandler {
  private fullContent: string = '';
  private updateIndex: number = 0;
  private lastUpdateTime: number = 0;
  private config: StreamingHandlerConfig;
  
  constructor(config: StreamingHandlerConfig) {
    this.config = config;
  }
  
  push(delta: string): StreamingUpdate | null {
    this.fullContent += delta;
    
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdateTime;
    
    // Check if we should throttle
    if (!this.config.immediate && timeSinceLastUpdate < this.config.throttleMs) {
      return null; // Throttled
    }
    
    this.lastUpdateTime = now;
    this.updateIndex++;
    
    return {
      fullContent: this.fullContent,
      delta,
      index: this.updateIndex,
    };
  }
  
  complete(): StreamingUpdate {
    this.updateIndex++;
    
    return {
      fullContent: this.fullContent,
      delta: '',
      index: this.updateIndex,
    };
  }
}

/**
 * Factory function to create streaming handler
 */
export function createStreamingHandler(config: StreamingHandlerConfig): IStreamingHandler {
  return new StreamingHandler(config);
}
