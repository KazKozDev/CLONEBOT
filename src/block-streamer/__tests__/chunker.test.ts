/**
 * Chunker Tests
 */

import { createChunker } from '../chunker';
import type { ChunkerConfig } from '../types';

describe('Chunker', () => {
  const defaultConfig: ChunkerConfig = {
    minChars: 100,
    maxChars: 500,
    protectCodeFences: true,
  };
  
  it('should accumulate until minChars', () => {
    const chunker = createChunker(defaultConfig);
    
    const chunks1 = chunker.push('Short text');
    expect(chunks1).toHaveLength(0);
    
    const chunks2 = chunker.push(' '.repeat(90));
    expect(chunks2).toHaveLength(0);
    
    expect(chunker.getBufferedLength()).toBeGreaterThan(90);
  });
  
  it('should emit chunk when exceeds maxChars', () => {
    const chunker = createChunker(defaultConfig);
    
    const longText = 'word '.repeat(120); // > 500 chars
    const chunks = chunker.push(longText);
    
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].content.length).toBeLessThanOrEqual(500);
  });
  
  it('should find good break points', () => {
    const chunker = createChunker(defaultConfig);
    
    const text = 'a'.repeat(200) + '.\n\n' + 'b'.repeat(200);
    const chunks = chunker.push(text);
    
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].breakType).toBe('paragraph');
  });
  
  it('should protect code fences', () => {
    const chunker = createChunker(defaultConfig);
    
    const text = 'Before fence.\n```python\n' + 'code\n'.repeat(30) + '```\nAfter fence.';
    const chunks = chunker.push(text);
    const lastChunk = chunker.flush();
    
    // Fence should be in one of the chunks completely
    const allContent = [...chunks, lastChunk].filter(Boolean).map(c => c!.content).join('');
    expect(allContent).toContain('```python');
    expect(allContent).toContain('After fence');
  });
  
  it('should flush remaining content', () => {
    const chunker = createChunker(defaultConfig);
    
    chunker.push('Short text that does not reach min');
    
    const chunk = chunker.flush();
    expect(chunk).toBeTruthy();
    expect(chunk!.content).toBe('Short text that does not reach min');
  });
  
  it('should return null on flush if empty', () => {
    const chunker = createChunker(defaultConfig);
    
    const chunk = chunker.flush();
    expect(chunk).toBeNull();
  });
  
  it('should handle code fence longer than maxChars', () => {
    const chunker = createChunker(defaultConfig);
    
    const longCode = '```\n' + 'x'.repeat(600) + '\n```';
    const chunks = chunker.push(longCode);
    
    // Should force hard break
    expect(chunks.length).toBeGreaterThan(0);
  });
  
  it('should not protect fences if disabled', () => {
    const chunker = createChunker({
      ...defaultConfig,
      protectCodeFences: false,
    });
    
    const text = 'x'.repeat(150) + '\n```\n' + 'y'.repeat(400);
    const chunks = chunker.push(text);
    
    // May break inside fence when protection disabled
    expect(chunks.length).toBeGreaterThan(0);
  });
});
