/**
 * Code Fence Tracker Tests
 */

import { createFenceTracker } from '../code-fence-tracker';

describe('CodeFenceTracker', () => {
  it('should start not in fence', () => {
    const tracker = createFenceTracker();
    
    expect(tracker.isInFence()).toBe(false);
    expect(tracker.getFenceInfo()).toBeNull();
  });
  
  it('should detect opening fence', () => {
    const tracker = createFenceTracker();
    tracker.update('```\n');
    
    expect(tracker.isInFence()).toBe(true);
    expect(tracker.getFenceInfo()).toMatchObject({
      marker: '```',
      language: undefined,
    });
  });
  
  it('should detect fence with language', () => {
    const tracker = createFenceTracker();
    tracker.update('```python\n');
    
    expect(tracker.isInFence()).toBe(true);
    expect(tracker.getFenceInfo()).toMatchObject({
      marker: '```',
      language: 'python',
    });
  });
  
  it('should detect closing fence', () => {
    const tracker = createFenceTracker();
    tracker.update('```\n');
    tracker.update('code\n');
    tracker.update('```\n');
    
    expect(tracker.isInFence()).toBe(false);
    expect(tracker.getFenceInfo()).toBeNull();
  });
  
  it('should handle tilde fences', () => {
    const tracker = createFenceTracker();
    tracker.update('~~~\n');
    
    expect(tracker.isInFence()).toBe(true);
    expect(tracker.getFenceInfo()).toMatchObject({
      marker: '~~~',
    });
    
    tracker.update('code\n');
    tracker.update('~~~\n');
    
    expect(tracker.isInFence()).toBe(false);
  });
  
  it('should not close with mismatched markers', () => {
    const tracker = createFenceTracker();
    tracker.update('```\n');
    tracker.update('code\n');
    tracker.update('~~~\n'); // Wrong marker
    
    expect(tracker.isInFence()).toBe(true); // Still in fence
  });
  
  it('should handle multiple fences', () => {
    const tracker = createFenceTracker();
    
    tracker.update('```\ncode1\n```\n');
    expect(tracker.isInFence()).toBe(false);
    
    tracker.update('```\ncode2\n```\n');
    expect(tracker.isInFence()).toBe(false);
  });
  
  it('should handle unclosed fence', () => {
    const tracker = createFenceTracker();
    tracker.update('```\n');
    tracker.update('code\n');
    tracker.update('more code\n');
    
    expect(tracker.isInFence()).toBe(true);
    expect(tracker.getFenceInfo()).toBeTruthy();
  });
  
  it('should reset state', () => {
    const tracker = createFenceTracker();
    tracker.update('```\ncode\n');
    
    expect(tracker.isInFence()).toBe(true);
    
    tracker.reset();
    
    expect(tracker.isInFence()).toBe(false);
    expect(tracker.getFenceInfo()).toBeNull();
  });
});
