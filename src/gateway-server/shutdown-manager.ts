/**
 * Graceful Shutdown Manager
 * 
 * Handle server shutdown gracefully
 */

import type { ServerState, ShutdownOptions } from './types';

export class ShutdownManager {
  private state: ServerState = 'stopped';
  private shutdownCallbacks: Array<() => Promise<void>> = [];
  private signalHandlers = new Map<NodeJS.Signals, () => void>();

  /**
   * Get current state
   */
  getState(): ServerState {
    return this.state;
  }

  /**
   * Set state
   */
  setState(state: ServerState): void {
    this.state = state;
  }

  /**
   * Register shutdown callback
   */
  onShutdown(callback: () => Promise<void>): void {
    this.shutdownCallbacks.push(callback);
  }

  /**
   * Initiate shutdown
   */
  async shutdown(options?: ShutdownOptions): Promise<void> {
    const graceful = options?.graceful ?? true;
    const timeout = options?.timeout ?? 10000;

    if (this.state === 'shutting_down' || this.state === 'stopped') {
      return;
    }

    this.state = 'shutting_down';

    if (!graceful) {
      // Force shutdown
      await this.executeCallbacks();
      this.state = 'stopped';
      return;
    }

    // Graceful shutdown with timeout
    const shutdownPromise = this.executeCallbacks();

    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<void>((resolve) => {
      timeoutId = setTimeout(() => {
        console.warn('Shutdown timeout reached, forcing shutdown');
        resolve();
      }, timeout);
      // Don't keep the event loop alive (important for Jest)
      timeoutId.unref?.();
    });

    await Promise.race([shutdownPromise, timeoutPromise]);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    this.state = 'stopped';
  }

  /**
   * Execute all shutdown callbacks
   */
  private async executeCallbacks(): Promise<void> {
    const promises = this.shutdownCallbacks.map(async (callback) => {
      try {
        await callback();
      } catch (error) {
        console.error('Shutdown callback error:', error);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Setup signal handlers
   */
  setupSignalHandlers(shutdownFn: () => Promise<void>): void {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

    for (const signal of signals) {
      const handler = () => {
        console.log(`\nReceived ${signal}, shutting down gracefully...`);
        shutdownFn().then(() => {
          process.exit(0);
        }).catch((error) => {
          console.error('Shutdown error:', error);
          process.exit(1);
        });
      };

      process.on(signal, handler);
      this.signalHandlers.set(signal, handler);
    }
  }

  /**
   * Remove signal handlers
   */
  removeSignalHandlers(): void {
    for (const [signal, handler] of this.signalHandlers.entries()) {
      process.removeListener(signal, handler);
    }
    this.signalHandlers.clear();
  }

  /**
   * Clear all callbacks
   */
  clear(): void {
    this.shutdownCallbacks = [];
    this.removeSignalHandlers();
  }
}

/**
 * Factory function
 */
export function createShutdownManager(): ShutdownManager {
  return new ShutdownManager();
}
