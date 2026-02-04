/**
 * Break Point Finder Tests
 */

import { createBreakPointFinder } from '../break-point-finder';

describe('BreakPointFinder', () => {
  const finder = createBreakPointFinder();
  
  it('should find paragraph break', () => {
    const text = 'First paragraph.\n\nSecond paragraph.';
    const breakPoint = finder.findBreakPoint(text, 10, 30);
    
    expect(breakPoint).toBeTruthy();
    expect(breakPoint!.type).toBe('paragraph');
    expect(breakPoint!.position).toBe(18); // After \n\n
  });
  
  it('should find sentence break when no paragraph', () => {
    const text = 'First sentence. Second sentence.';
    const breakPoint = finder.findBreakPoint(text, 10, 30);
    
    expect(breakPoint).toBeTruthy();
    expect(breakPoint!.type).toBe('sentence');
    expect(breakPoint!.position).toBe(16); // After '. '
  });
  
  it('should find line break when no sentence', () => {
    const text = 'Line one\nLine two\nLine three';
    const breakPoint = finder.findBreakPoint(text, 5, 20);
    
    expect(breakPoint).toBeTruthy();
    expect(breakPoint!.type).toBe('line');
    expect(breakPoint!.position).toBe(9); // After first \n
  });
  
  it('should find clause break', () => {
    const text = 'First clause, second clause; third clause.';
    const breakPoint = finder.findBreakPoint(text, 10, 25);
    
    expect(breakPoint).toBeTruthy();
    expect(breakPoint!.type).toBe('clause');
    expect(breakPoint!.position).toBe(14); // After ', '
  });
  
  it('should find word break', () => {
    const text = 'one two three four five';
    const breakPoint = finder.findBreakPoint(text, 10, 20);
    
    expect(breakPoint).toBeTruthy();
    expect(breakPoint!.type).toBe('word');
  });
  
  it('should fall back to hard break', () => {
    const text = 'verylongwordwithoutanyspaces';
    const breakPoint = finder.findBreakPoint(text, 10, 20);
    
    expect(breakPoint).toBeTruthy();
    expect(breakPoint!.type).toBe('hard');
    expect(breakPoint!.position).toBe(20);
  });
  
  it('should respect minPos', () => {
    const text = 'First. Second. Third.';
    const breakPoint = finder.findBreakPoint(text, 15, 21);
    
    expect(breakPoint).toBeTruthy();
    expect(breakPoint!.position).toBeGreaterThanOrEqual(15);
  });
  
  it('should not break beyond maxPos', () => {
    const text = 'First. Second. Third.';
    const breakPoint = finder.findBreakPoint(text, 0, 10);
    
    expect(breakPoint).toBeTruthy();
    expect(breakPoint!.position).toBeLessThanOrEqual(10);
  });
});
