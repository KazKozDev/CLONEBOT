/**
 * Text Buffer
 * 
 * Efficient text accumulation buffer for streaming
 */

import type { TextBuffer } from './types';

/**
 * Simple string-based buffer implementation
 * Optimized for append operations and partial consumption
 */
export class StringBuffer implements TextBuffer {
  private buffer: string = '';
  
  append(text: string): void {
    this.buffer += text;
  }
  
  length(): number {
    return this.buffer.length;
  }
  
  slice(start: number, end?: number): string {
    return this.buffer.slice(start, end);
  }
  
  clear(): void {
    this.buffer = '';
  }
  
  consume(length: number): string {
    const consumed = this.buffer.slice(0, length);
    this.buffer = this.buffer.slice(length);
    return consumed;
  }
  
  peek(length?: number): string {
    if (length === undefined) {
      return this.buffer;
    }
    return this.buffer.slice(0, length);
  }
  
  toString(): string {
    return this.buffer;
  }
}

/**
 * Rope-based buffer for large texts
 * Uses array of chunks to avoid large string concatenations
 */
export class RopeBuffer implements TextBuffer {
  private chunks: string[] = [];
  private totalLength: number = 0;
  
  append(text: string): void {
    this.chunks.push(text);
    this.totalLength += text.length;
  }
  
  length(): number {
    return this.totalLength;
  }
  
  slice(start: number, end?: number): string {
    // Flatten when needed for slice
    return this.toString().slice(start, end);
  }
  
  clear(): void {
    this.chunks = [];
    this.totalLength = 0;
  }
  
  consume(length: number): string {
    const consumed = this.toString().slice(0, length);
    const remaining = this.toString().slice(length);
    
    this.chunks = remaining.length > 0 ? [remaining] : [];
    this.totalLength = remaining.length;
    
    return consumed;
  }
  
  peek(length?: number): string {
    const full = this.toString();
    if (length === undefined) {
      return full;
    }
    return full.slice(0, length);
  }
  
  toString(): string {
    return this.chunks.join('');
  }
}

/**
 * Factory function to create appropriate buffer implementation
 */
export function createTextBuffer(implementation: 'string' | 'rope' = 'string'): TextBuffer {
  switch (implementation) {
    case 'rope':
      return new RopeBuffer();
    case 'string':
    default:
      return new StringBuffer();
  }
}
