/**
 * Middleware System
 * 
 * Composable middleware pipeline with error handling
 */

import type { Request, Response, Middleware, NextFunction, MiddlewareConfig } from './types';

/**
 * Middleware Manager
 */
export class MiddlewareManager {
  private globalMiddlewares: Middleware[] = [];
  private pathMiddlewares: MiddlewareConfig[] = [];

  /**
   * Add global middleware
   */
  use(middleware: Middleware): void;
  use(path: string, middleware: Middleware): void;
  use(pathOrMiddleware: string | Middleware, middleware?: Middleware): void {
    if (typeof pathOrMiddleware === 'string') {
      if (!middleware) {
        throw new Error('Middleware required when path is provided');
      }
      this.pathMiddlewares.push({
        path: pathOrMiddleware,
        middleware,
      });
    } else {
      this.globalMiddlewares.push(pathOrMiddleware);
    }
  }

  /**
   * Get middlewares for a path
   */
  getMiddlewaresForPath(path: string): Middleware[] {
    const middlewares: Middleware[] = [];

    // Global middlewares first
    middlewares.push(...this.globalMiddlewares);

    // Path-specific middlewares
    for (const config of this.pathMiddlewares) {
      if (config.path && path.startsWith(config.path)) {
        middlewares.push(config.middleware);
      }
    }

    return middlewares;
  }

  /**
   * Execute middleware chain
   */
  async execute(req: Request, res: Response, middlewares: Middleware[]): Promise<void> {
    let index = 0;

    const next: NextFunction = async () => {
      if (index >= middlewares.length) {
        return;
      }

      const middleware = middlewares[index++];
      await middleware(req, res, next);
    };

    await next();
  }

  /**
   * Clear all middlewares
   */
  clear(): void {
    this.globalMiddlewares = [];
    this.pathMiddlewares = [];
  }
}

/**
 * Compose multiple middlewares into one
 */
export function compose(...middlewares: Middleware[]): Middleware {
  return async (req: Request, res: Response, next: NextFunction) => {
    let index = 0;

    const dispatch = async (): Promise<void> => {
      if (index >= middlewares.length) {
        await next();
        return;
      }

      const middleware = middlewares[index++];
      await middleware(req, res, dispatch);
    };

    await dispatch();
  };
}

/**
 * Error handling middleware wrapper
 */
export function catchErrors(middleware: Middleware): Middleware {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await middleware(req, res, next);
    } catch (error) {
      // Set error on request for error handler
      (req as any).error = error;
      await next();
    }
  };
}

/**
 * Factory function
 */
export function createMiddlewareManager(): MiddlewareManager {
  return new MiddlewareManager();
}
