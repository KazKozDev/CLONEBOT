/**
 * Event Stream
 * 
 * AsyncIterable stream of agent events with backpressure support.
 */

import type { AgentEvent } from './types';

// ============================================================================
// Event Stream
// ============================================================================

export class EventStream {
  private buffer: AgentEvent[] = [];
  private waiters: Array<(event: AgentEvent | null) => void> = [];
  private closed: boolean = false;
  private streamError: Error | null = null;
  private maxBufferSize: number;
  
  constructor(maxBufferSize: number = 100) {
    this.maxBufferSize = maxBufferSize;
  }
  
  /**
   * Emit event to stream
   */
  async emit(event: AgentEvent): Promise<void> {
    if (this.closed) {
      throw new Error('Stream is closed');
    }
    
    // If waiters, deliver immediately
    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      waiter(event);
      return;
    }
    
    // Buffer event
    this.buffer.push(event);
    
    // Apply backpressure if buffer full
    if (this.buffer.length >= this.maxBufferSize) {
      await new Promise<void>(resolve => {
        const interval = setInterval(() => {
          if (this.buffer.length < this.maxBufferSize / 2) {
            clearInterval(interval);
            resolve();
          }
        }, 10);
      });
    }
  }
  
  /**
   * Close stream normally
   */
  close(): void {
    this.closed = true;
    
    // Resolve all waiters with null
    for (const waiter of this.waiters) {
      waiter(null);
    }
    this.waiters = [];
  }
  
  /**
   * Close stream with error
   */
  setError(err: Error): void {
    this.streamError = err;
    this.close();
  }
  
  /**
   * Get next event
   */
  private async next(): Promise<AgentEvent | null> {
    // Return buffered event
    if (this.buffer.length > 0) {
      return this.buffer.shift()!;
    }
    
    // If closed, return null
    if (this.closed) {
      if (this.streamError) {
        throw this.streamError;
      }
      return null;
    }
    
    // Wait for next event
    return new Promise<AgentEvent | null>(resolve => {
      this.waiters.push(resolve);
    });
  }
  
  /**
   * Create async iterator
   */
  async *[Symbol.asyncIterator](): AsyncIterator<AgentEvent> {
    while (true) {
      const event = await this.next();
      if (event === null) {
        break;
      }
      yield event;
    }
  }
}
