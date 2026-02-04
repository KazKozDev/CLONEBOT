/**
 * Authentication Middleware
 * 
 * Multiple authentication modes: none, token, apikey, multi
 */

import type { Request, Response, Middleware, AuthConfig, AuthInfo, ApiKey } from './types';
import { AuthenticationError } from './types';

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match ? match[1] : null;
}

/**
 * Extract API key from X-API-Key header
 */
function extractApiKey(req: Request): string | null {
  return req.headers['x-api-key'] || null;
}

/**
 * Extract token from query parameter (for WebSocket)
 */
function extractQueryToken(req: Request): string | null {
  return req.query.token || null;
}

/**
 * Validate token
 */
function validateToken(token: string, config: AuthConfig): AuthInfo | null {
  if (config.mode !== 'token' && config.mode !== 'multi') {
    return null;
  }

  const expectedToken = config.token;
  if (!expectedToken) {
    return null;
  }

  if (token === expectedToken) {
    return {
      authenticated: true,
      method: 'token',
      identity: 'token-user',
      permissions: ['*'],
    };
  }

  return null;
}

/**
 * Validate API key
 */
function validateApiKey(key: string, config: AuthConfig): AuthInfo | null {
  if (config.mode !== 'apikey' && config.mode !== 'multi') {
    return null;
  }

  const keys = config.keys || [];
  const found = keys.find((k) => k.key === key);

  if (found) {
    return {
      authenticated: true,
      method: 'apikey',
      identity: found.name,
      permissions: found.permissions,
    };
  }

  return null;
}

/**
 * Validate with multi providers
 */
function validateMulti(req: Request, config: AuthConfig): AuthInfo | null {
  if (config.mode !== 'multi' || !config.providers) {
    return null;
  }

  // Try each provider
  for (const provider of config.providers) {
    if (provider.type === 'token') {
      const token = extractBearerToken(req) || extractQueryToken(req);
      if (token) {
        const authInfo = validateToken(token, {
          mode: 'token',
          token: provider.token,
        });
        if (authInfo) {
          return authInfo;
        }
      }
    } else if (provider.type === 'apikey') {
      const apiKey = extractApiKey(req);
      if (apiKey) {
        const authInfo = validateApiKey(apiKey, {
          mode: 'apikey',
          keys: provider.keys,
        });
        if (authInfo) {
          return authInfo;
        }
      }
    }
  }

  return null;
}

/**
 * Create authentication middleware
 */
export function createAuthMiddleware(config: AuthConfig): Middleware {
  return async (req: Request, res: Response, next) => {
    // No auth mode - allow all
    if (config.mode === 'none') {
      req.auth = {
        authenticated: false,
        method: 'none',
        identity: 'anonymous',
        permissions: ['*'],
      };
      await next();
      return;
    }

    let authInfo: AuthInfo | null = null;

    // Multi mode
    if (config.mode === 'multi') {
      authInfo = validateMulti(req, config);
    }
    // Token mode
    else if (config.mode === 'token') {
      const token = extractBearerToken(req) || extractQueryToken(req);
      if (token) {
        authInfo = validateToken(token, config);
      }
    }
    // API Key mode
    else if (config.mode === 'apikey') {
      const apiKey = extractApiKey(req);
      if (apiKey) {
        authInfo = validateApiKey(apiKey, config);
      }
    }

    // Authentication failed
    if (!authInfo) {
      res.status(401).json({
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Authentication required',
        },
      });
      return;
    }

    // Attach auth info to request
    req.auth = authInfo;
    await next();
  };
}

/**
 * Require specific permissions
 */
export function requirePermissions(...required: string[]): Middleware {
  return async (req: Request, res: Response, next) => {
    if (!req.auth || !req.auth.authenticated) {
      res.status(401).json({
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Authentication required',
        },
      });
      return;
    }

    const permissions = req.auth.permissions;

    // Wildcard permission
    if (permissions.includes('*')) {
      await next();
      return;
    }

    // Check each required permission
    for (const perm of required) {
      if (!permissions.includes(perm)) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: `Missing required permission: ${perm}`,
          },
        });
        return;
      }
    }

    await next();
  };
}

/**
 * Optional authentication (doesn't fail if not authenticated)
 */
export function optionalAuth(config: AuthConfig): Middleware {
  return async (req: Request, res: Response, next) => {
    if (config.mode === 'none') {
      req.auth = {
        authenticated: false,
        method: 'none',
        identity: 'anonymous',
        permissions: [],
      };
      await next();
      return;
    }

    let authInfo: AuthInfo | null = null;

    if (config.mode === 'multi') {
      authInfo = validateMulti(req, config);
    } else if (config.mode === 'token') {
      const token = extractBearerToken(req) || extractQueryToken(req);
      if (token) {
        authInfo = validateToken(token, config);
      }
    } else if (config.mode === 'apikey') {
      const apiKey = extractApiKey(req);
      if (apiKey) {
        authInfo = validateApiKey(apiKey, config);
      }
    }

    req.auth = authInfo || {
      authenticated: false,
      method: 'none',
      identity: 'anonymous',
      permissions: [],
    };

    await next();
  };
}
