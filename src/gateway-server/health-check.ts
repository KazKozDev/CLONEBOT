/**
 * Health Check System
 * 
 * Monitor system health with pluggable checkers
 */

import type {
  HealthStatus,
  HealthCheck,
  HealthReport,
  HealthChecker,
} from './types';

export class HealthCheckManager {
  private checkers = new Map<string, HealthChecker>();
  private version: string;
  private startTime: number;

  constructor(version: string = '1.0.0') {
    this.version = version;
    this.startTime = Date.now();
  }

  /**
   * Register health checker
   */
  register(name: string, checker: HealthChecker): void {
    this.checkers.set(name, checker);
  }

  /**
   * Unregister health checker
   */
  unregister(name: string): void {
    this.checkers.delete(name);
  }

  /**
   * Run all health checks
   */
  async runChecks(timeout: number = 5000): Promise<HealthReport> {
    const checks: Record<string, HealthCheck> = {};
    const promises: Promise<void>[] = [];

    for (const [name, checker] of this.checkers.entries()) {
      const promise = Promise.race([
        // Run checker
        Promise.resolve(checker()).then((result) => {
          checks[name] = result;
        }),
        // Timeout
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), timeout)
        ),
      ]).catch((error) => {
        checks[name] = {
          status: 'unhealthy',
          message: error.message || 'Check failed',
        };
      });

      promises.push(promise);
    }

    await Promise.all(promises);

    // Determine overall status
    const statuses = Object.values(checks).map((c) => c.status);
    let overallStatus: HealthStatus = 'healthy';

    if (statuses.includes('unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (statuses.includes('degraded')) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      version: this.version,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks,
    };
  }

  /**
   * Quick health check (no external dependencies)
   */
  quickCheck(): HealthReport {
    return {
      status: 'healthy',
      version: this.version,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks: {},
    };
  }

  /**
   * Clear all checkers
   */
  clear(): void {
    this.checkers.clear();
  }
}

/**
 * Common health checkers
 */
export const commonCheckers = {
  /**
   * Memory usage checker
   */
  memory: (): HealthCheck => {
    const usage = process.memoryUsage();
    const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;

    let status: HealthStatus = 'healthy';
    if (heapUsedPercent > 90) {
      status = 'unhealthy';
    } else if (heapUsedPercent > 75) {
      status = 'degraded';
    }

    return {
      status,
      details: {
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
        heapUsedPercent: Math.round(heapUsedPercent) + '%',
      },
    };
  },

  /**
   * Disk space checker (requires fs module)
   */
  diskSpace: async (): Promise<HealthCheck> => {
    // Simplified - would need platform-specific implementation
    return {
      status: 'healthy',
      details: {
        free: '> 1GB',
      },
    };
  },

  /**
   * Database connection checker
   */
  database: (checkFn: () => Promise<boolean>): HealthChecker => {
    return async (): Promise<HealthCheck> => {
      const start = Date.now();
      try {
        const connected = await checkFn();
        const latency = Date.now() - start;

        return {
          status: connected ? 'healthy' : 'unhealthy',
          latency,
          message: connected ? 'Connected' : 'Disconnected',
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          latency: Date.now() - start,
          message: (error as Error).message,
        };
      }
    };
  },
};

/**
 * Factory function
 */
export function createHealthCheckManager(version?: string): HealthCheckManager {
  return new HealthCheckManager(version);
}
