/**
 * Run State Machine
 * 
 * Manages run lifecycle state transitions.
 */

import type { RunState } from './types';

// ============================================================================
// State Transitions
// ============================================================================

const VALID_TRANSITIONS: Record<RunState, RunState[]> = {
  pending: ['queued', 'failed', 'cancelled'],
  queued: ['running', 'cancelled', 'timeout'],
  running: ['completed', 'failed', 'cancelled', 'timeout'],
  completed: [],
  failed: [],
  cancelled: [],
  timeout: [],
};

const FINAL_STATES: Set<RunState> = new Set([
  'completed',
  'failed',
  'cancelled',
  'timeout',
]);

// ============================================================================
// State Machine
// ============================================================================

export class RunStateMachine {
  /**
   * Check if transition is valid
   */
  canTransition(from: RunState, to: RunState): boolean {
    const allowed = VALID_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }
  
  /**
   * Attempt state transition
   */
  transition(from: RunState, to: RunState): RunState {
    if (!this.canTransition(from, to)) {
      throw new Error(`Invalid state transition: ${from} -> ${to}`);
    }
    
    return to;
  }
  
  /**
   * Check if state is final
   */
  isFinal(state: RunState): boolean {
    return FINAL_STATES.has(state);
  }
  
  /**
   * Get valid next states
   */
  getValidNextStates(state: RunState): RunState[] {
    return VALID_TRANSITIONS[state] || [];
  }
}

// ============================================================================
// Singleton
// ============================================================================

export const stateMachine = new RunStateMachine();
