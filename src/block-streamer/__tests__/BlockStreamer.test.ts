/**
 * BlockStreamer Integration Tests
 */

import { createBlockStreamer } from '../BlockStreamer';
import type { Block, StreamingUpdate, CompleteSummary } from '../types';

describe('BlockStreamer', () => {
  describe('block mode', () => {
    it('should emit blocks as they become ready', (done) => {
      const blocks: Block[] = [];
      
      const streamer = createBlockStreamer({
        profile: 'web',
        mode: 'block',
        onBlock: (block) => blocks.push(block),
        onComplete: () => {
          expect(blocks.length).toBeGreaterThan(0);
          expect(blocks[0].isFirst).toBe(true);
          // Last block should have isLast flag
          const hasLastBlock = blocks.some(b => b.isLast);
          expect(hasLastBlock).toBe(true);
          done();
        },
      });
      
      // Simulate streaming text
      streamer.push('First paragraph.\n\n');
      streamer.push('Second paragraph.\n\n');
      streamer.push('Third paragraph.');
      streamer.complete();
    });
    
    it('should respect channel limits', () => {
      const blocks: Block[] = [];
      
      const streamer = createBlockStreamer({
        profile: 'discord', // maxChars: 2000
        mode: 'block',
        onBlock: (block) => blocks.push(block),
      });
      
      const longText = 'word '.repeat(1000); // > 2000 chars
      streamer.push(longText);
      streamer.complete();
      
      // All blocks should be under limit
      blocks.forEach(block => {
        expect(block.content.length).toBeLessThanOrEqual(2000);
      });
    });
  });
  
  describe('streaming mode', () => {
    it('should emit progressive updates', (done) => {
      const updates: StreamingUpdate[] = [];
      
      const streamer = createBlockStreamer({
        profile: 'telegram',
        mode: 'streaming',
        onUpdate: (update) => updates.push(update),
        onComplete: () => {
          expect(updates.length).toBeGreaterThan(0);
          expect(updates[updates.length - 1].fullContent).toBe('Hello World!');
          done();
        },
      });
      
      streamer.push('Hello ');
      streamer.push('World');
      streamer.push('!');
      streamer.complete();
    });
    
    it('should accumulate full content', () => {
      let fullContent = '';
      
      const streamer = createBlockStreamer({
        mode: 'streaming',
        onUpdate: (update) => {
          fullContent = update.fullContent;
        },
      });
      
      streamer.push('Part 1. ');
      streamer.push('Part 2. ');
      streamer.push('Part 3.');
      streamer.complete();
      
      expect(fullContent).toBe('Part 1. Part 2. Part 3.');
    });
  });
  
  describe('batch mode', () => {
    it('should emit all blocks on complete', (done) => {
      const blocks: Block[] = [];
      
      const streamer = createBlockStreamer({
        mode: 'batch',
        onBlock: (block) => blocks.push(block),
        onComplete: () => {
          expect(blocks.length).toBeGreaterThan(0);
          done();
        },
      });
      
      streamer.push('Text 1.\n\n');
      streamer.push('Text 2.\n\n');
      streamer.push('Text 3.');
      
      expect(blocks).toHaveLength(0); // Nothing emitted yet
      
      streamer.complete();
    });
  });
  
  describe('state and stats', () => {
    it('should track state correctly', () => {
      const streamer = createBlockStreamer({ mode: 'block' });
      
      const initialState = streamer.getState();
      expect(initialState.isComplete).toBe(false);
      expect(initialState.emittedBlocks).toBe(0);
      
      streamer.push('Some text');
      streamer.complete();
      
      const finalState = streamer.getState();
      expect(finalState.isComplete).toBe(true);
    });
    
    it('should collect statistics', () => {
      const streamer = createBlockStreamer({ mode: 'block' });
      
      streamer.push('Hello World');
      streamer.complete();
      
      const stats = streamer.getStats();
      expect(stats.totalInputChars).toBe(11);
      expect(stats.duration).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('configuration', () => {
    it('should allow profile change', () => {
      const blocks: Block[] = [];
      
      const streamer = createBlockStreamer({
        profile: 'web',
        mode: 'block',
        onBlock: (block) => blocks.push(block),
      });
      
      streamer.push('a'.repeat(5000));
      
      // Change to discord (maxChars: 2000)
      streamer.setProfile('discord');
      streamer.push('b'.repeat(5000));
      
      streamer.complete();
      
      // Should respect new profile limits
      const discordBlocks = blocks.filter(b => b.content.includes('b'));
      discordBlocks.forEach(block => {
        expect(block.content.length).toBeLessThanOrEqual(2000);
      });
    });
  });
  
  describe('error handling', () => {
    it('should throw on push after complete', () => {
      const streamer = createBlockStreamer({ mode: 'block' });
      
      streamer.push('Text');
      streamer.complete();
      
      expect(() => streamer.push('More')).toThrow();
    });
    
    it('should call error callback', () => {
      let errorCaught = false;
      
      const streamer = createBlockStreamer({
        mode: 'block',
        onError: (error) => {
          errorCaught = true;
          expect(error).toBeTruthy();
        },
      });
      
      streamer.push('Text');
      streamer.complete();
      
      try {
        streamer.push('More');
      } catch (e) {
        // Expected to throw
      }
      
      // If onError was set, it should have been called
      expect(errorCaught).toBe(true);
    });
  });
  
  describe('complete callback', () => {
    it('should emit summary on complete', (done) => {
      const streamer = createBlockStreamer({
        mode: 'block',
        onComplete: (summary: CompleteSummary) => {
          expect(summary.totalChars).toBeGreaterThan(0);
          expect(summary.totalBlocks).toBeGreaterThan(0);
          expect(summary.duration).toBeGreaterThanOrEqual(0);
          done();
        },
      });
      
      streamer.push('Some text to process');
      streamer.complete();
    });
  });
  
  describe('code fence handling', () => {
    it('should not break inside code fences', () => {
      const blocks: Block[] = [];
      
      const streamer = createBlockStreamer({
        profile: 'discord', // Small limit
        mode: 'block',
        onBlock: (block) => blocks.push(block),
      });
      
      const code = '```python\n' + 'def hello():\n' + '  pass\n' + '```';
      streamer.push(code);
      streamer.complete();
      
      // Code fence should stay together
      const codeBlock = blocks.find(b => b.content.includes('```'));
      expect(codeBlock?.content).toContain('def hello()');
      expect(codeBlock?.content).toMatch(/```python[\s\S]*```/);
    });
  });
});
