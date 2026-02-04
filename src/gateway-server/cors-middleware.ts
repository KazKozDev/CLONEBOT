/**
 * CORS Middleware
 * 
 * Cross-Origin Resource Sharing support
 */

import type { Request, Response, Middleware, CORSConfig } from './types';

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) {
    return false;
  }

  // Wildcard
  if (allowedOrigins.includes('*')) {
    return true;
  }

  // Exact match
  return allowedOrigins.includes(origin);
}

/**
 * Create CORS middleware
 */
export function createCORSMiddleware(config: CORSConfig): Middleware {
  if (!config.enabled) {
    // Pass-through if disabled
    return async (_req, _res, next) => {
      await next();
    };
  }

  const {
    origins,
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    headers = ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials = false,
    maxAge = 86400,
  } = config;

  return async (req: Request, res: Response, next) => {
    const origin = req.headers.origin;

    // Always set CORS headers for EventSource compatibility
    if (origins.includes('*')) {
      // Wildcard - but EventSource requires explicit origin
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Methods', methods.join(', '));
      res.header('Access-Control-Allow-Headers', headers.join(', '));
      res.header('Access-Control-Max-Age', String(maxAge));
      if (credentials && origin) {
        res.header('Access-Control-Allow-Credentials', 'true');
      }
    } else if (origin && isOriginAllowed(origin, origins)) {
      // Specific origin allowed
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Methods', methods.join(', '));
      res.header('Access-Control-Allow-Headers', headers.join(', '));
      res.header('Access-Control-Max-Age', String(maxAge));
      if (credentials) {
        res.header('Access-Control-Allow-Credentials', 'true');
      }
    }

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(204).send();
      return;
    }

    await next();
  };
}
