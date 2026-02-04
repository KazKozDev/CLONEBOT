/**
 * Text Buffer Tests
 */

import { StringBuffer, RopeBuffer, createTextBuffer } from '../text-buffer';

describe('StringBuffer', () => {
  let buffer: StringBuffer;
  
  beforeEach(() => {
    buffer = new StringBuffer();
  });
  
  it('should start empty', () => {
    expect(buffer.length()).toBe(0);
    expect(buffer.toString()).toBe('');
  });
  
  it('should append text', () => {
    buffer.append('Hello');
    buffer.append(' ');
    buffer.append('World');
    
    expect(buffer.length()).toBe(11);
    expect(buffer.toString()).toBe('Hello World');
  });
  
  it('should slice text', () => {
    buffer.append('Hello World');
    
    expect(buffer.slice(0, 5)).toBe('Hello');
    expect(buffer.slice(6)).toBe('World');
    expect(buffer.slice(0, 11)).toBe('Hello World');
  });
  
  it('should peek without removing', () => {
    buffer.append('Hello World');
    
    expect(buffer.peek(5)).toBe('Hello');
    expect(buffer.length()).toBe(11); // Still full
    
    expect(buffer.peek()).toBe('Hello World');
    expect(buffer.length()).toBe(11);
  });
  
  it('should consume and remove', () => {
    buffer.append('Hello World');
    
    const consumed = buffer.consume(6);
    expect(consumed).toBe('Hello ');
    expect(buffer.length()).toBe(5);
    expect(buffer.toString()).toBe('World');
  });
  
  it('should clear completely', () => {
    buffer.append('Hello World');
    buffer.clear();
    
    expect(buffer.length()).toBe(0);
    expect(buffer.toString()).toBe('');
  });
  
  it('should handle large text', () => {
    const largeText = 'x'.repeat(1_000_000);
    buffer.append(largeText);
    
    expect(buffer.length()).toBe(1_000_000);
    expect(buffer.peek(10)).toBe('xxxxxxxxxx');
  });
});

describe('RopeBuffer', () => {
  let buffer: RopeBuffer;
  
  beforeEach(() => {
    buffer = new RopeBuffer();
  });
  
  it('should accumulate chunks', () => {
    buffer.append('Hello');
    buffer.append(' ');
    buffer.append('World');
    
    expect(buffer.length()).toBe(11);
    expect(buffer.toString()).toBe('Hello World');
  });
  
  it('should consume correctly', () => {
    buffer.append('Hello');
    buffer.append(' ');
    buffer.append('World');
    
    const consumed = buffer.consume(6);
    expect(consumed).toBe('Hello ');
    expect(buffer.toString()).toBe('World');
  });
});

describe('createTextBuffer', () => {
  it('should create string buffer by default', () => {
    const buffer = createTextBuffer();
    expect(buffer).toBeInstanceOf(StringBuffer);
  });
  
  it('should create rope buffer when specified', () => {
    const buffer = createTextBuffer('rope');
    expect(buffer).toBeInstanceOf(RopeBuffer);
  });
});
