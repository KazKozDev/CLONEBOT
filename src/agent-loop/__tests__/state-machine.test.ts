/**
 * State Machine Tests
 */

import { RunStateMachine } from '../state-machine';
import type { RunState } from '../types';

describe('RunStateMachine', () => {
  let machine: RunStateMachine;
  
  beforeEach(() => {
    machine = new RunStateMachine();
  });
  
  describe('State Transitions', () => {
    it('should allow valid transitions', () => {
      expect(machine.canTransition('pending', 'queued')).toBe(true);
      expect(machine.canTransition('queued', 'running')).toBe(true);
      expect(machine.canTransition('running', 'completed')).toBe(true);
    });
    
    it('should reject invalid transitions', () => {
      expect(machine.canTransition('pending', 'completed')).toBe(false);
      expect(machine.canTransition('completed', 'running')).toBe(false);
      expect(machine.canTransition('failed', 'queued')).toBe(false);
    });
    
    it('should transition successfully', () => {
      const newState = machine.transition('pending', 'queued');
      expect(newState).toBe('queued');
    });
    
    it('should throw on invalid transition', () => {
      expect(() => machine.transition('pending', 'completed'))
        .toThrow('Invalid state transition: pending -> completed');
    });
  });
  
  describe('Final States', () => {
    it('should identify final states', () => {
      expect(machine.isFinal('completed')).toBe(true);
      expect(machine.isFinal('failed')).toBe(true);
      expect(machine.isFinal('cancelled')).toBe(true);
      expect(machine.isFinal('timeout')).toBe(true);
    });
    
    it('should identify non-final states', () => {
      expect(machine.isFinal('pending')).toBe(false);
      expect(machine.isFinal('queued')).toBe(false);
      expect(machine.isFinal('running')).toBe(false);
    });
  });
  
  describe('Valid Next States', () => {
    it('should return valid next states', () => {
      const nextStates = machine.getValidNextStates('pending');
      expect(nextStates).toContain('queued');
      expect(nextStates).toContain('cancelled');
    });
    
    it('should return empty array for final states', () => {
      expect(machine.getValidNextStates('completed')).toEqual([]);
      expect(machine.getValidNextStates('failed')).toEqual([]);
    });
  });
});
