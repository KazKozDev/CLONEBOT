/**
 * Run Context
 * 
 * Execution context for a single run.
 */

import type { RunContext as IRunContext, TurnStats } from './types';

// ============================================================================
// Context Builder
// ============================================================================

export class RunContextBuilder {
  private context: Partial<IRunContext> = {};
  
  constructor(runId: string, sessionId: string) {
    this.context = {
      runId,
      sessionId,
      startedAt: Date.now(),
      metrics: {
        contextAssembly: { duration: 0 },
        modelCalls: [],
        toolExecutions: [],
        persistence: { duration: 0 },
        total: { duration: 0 },
      },
      turns: {
        turns: 0,
        toolRounds: 0,
        maxTurns: 10,
        maxToolRounds: 5,
      },
    };
  }
  
  setSession(session: any): this {
    this.context.session = session;
    return this;
  }
  
  setContext(context: any): this {
    this.context.context = context;
    return this;
  }
  
  setTurnStats(stats: TurnStats): this {
    this.context.turns = stats;
    return this;
  }
  
  recordContextAssembly(duration: number): this {
    this.context.metrics!.contextAssembly = { duration };
    return this;
  }
  
  recordModelCall(duration: number, tokens?: { prompt: number; completion: number }): this {
    this.context.metrics!.modelCalls.push({
      duration,
      tokens: tokens ?? { prompt: 0, completion: 0 },
    });
    return this;
  }
  
  recordToolExecution(duration: number, toolName: string, success: boolean): this {
    this.context.metrics!.toolExecutions.push({
      duration,
      toolName,
      success,
    });
    return this;
  }
  
  recordPersistence(duration: number): this {
    this.context.metrics!.persistence = { duration };
    return this;
  }
  
  build(): IRunContext {
    if (!this.context.runId || !this.context.sessionId) {
      throw new Error('Run context missing required fields');
    }
    
    // Calculate total duration
    const completedAt = Date.now();
    this.context.completedAt = completedAt;
    this.context.metrics!.total = {
      duration: completedAt - this.context.startedAt!,
    };
    
    return this.context as IRunContext;
  }
  
  getContext(): IRunContext {
    return this.context as IRunContext;
  }
}
