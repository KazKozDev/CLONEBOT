/**
 * Cancellation Handler
 * 
 * Handles run cancellation with AbortSignal.
 */

// ============================================================================
// Cancellation
// ============================================================================

export class CancellationHandler {
  private abortControllers: Map<string, AbortController> = new Map();
  
  /**
   * Create abort controller for run
   */
  create(runId: string): AbortSignal {
    const controller = new AbortController();
    this.abortControllers.set(runId, controller);
    return controller.signal;
  }
  
  /**
   * Cancel run
   */
  cancel(runId: string, reason?: string): void {
    const controller = this.abortControllers.get(runId);
    if (controller && !controller.signal.aborted) {
      controller.abort(reason ?? 'Run cancelled');
    }
  }
  
  /**
   * Check if run is cancelled
   */
  isCancelled(runId: string): boolean {
    const controller = this.abortControllers.get(runId);
    return controller ? controller.signal.aborted : false;
  }
  
  /**
   * Get abort signal
   */
  getSignal(runId: string): AbortSignal | null {
    const controller = this.abortControllers.get(runId);
    return controller ? controller.signal : null;
  }
  
  /**
   * Cleanup after run completes
   */
  cleanup(runId: string): void {
    this.abortControllers.delete(runId);
  }
  
  /**
   * Throw if cancelled
   */
  throwIfCancelled(runId: string): void {
    if (this.isCancelled(runId)) {
      throw new Error(`Run ${runId} was cancelled`);
    }
  }
}
