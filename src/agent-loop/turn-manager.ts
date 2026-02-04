/**
 * Turn Manager
 * 
 * Manages multi-turn conversations with tool rounds.
 */

import type { TurnStats } from './types';

// ============================================================================
// Turn Manager
// ============================================================================

export class TurnManager {
  private turns: number = 0;
  private toolRounds: number = 0;
  private maxTurns: number;
  private maxToolRounds: number;
  
  constructor(maxTurns: number = 10, maxToolRounds: number = 5) {
    this.maxTurns = maxTurns;
    this.maxToolRounds = maxToolRounds;
  }
  
  /**
   * Start new turn
   */
  startTurn(): void {
    this.turns++;
  }
  
  /**
   * Start tool round
   */
  startToolRound(): void {
    this.toolRounds++;
  }
  
  /**
   * Check if can continue
   */
  canContinue(): { continue: boolean; reason?: string } {
    if (this.turns >= this.maxTurns) {
      return {
        continue: false,
        reason: `Maximum turns reached (${this.maxTurns})`,
      };
    }
    
    if (this.toolRounds >= this.maxToolRounds) {
      return {
        continue: false,
        reason: `Maximum tool rounds reached (${this.maxToolRounds})`,
      };
    }
    
    return { continue: true };
  }
  
  /**
   * Get current stats
   */
  getStats(): TurnStats {
    return {
      turns: this.turns,
      toolRounds: this.toolRounds,
      maxTurns: this.maxTurns,
      maxToolRounds: this.maxToolRounds,
    };
  }
  
  /**
   * Reset counters
   */
  reset(): void {
    this.turns = 0;
    this.toolRounds = 0;
  }
}
