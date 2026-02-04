/**
 * HTTP Router
 * 
 * Path matching and routing with parameter extraction
 */

import type { HTTPMethod, Route, RouteHandler, RouteMatch } from './types';

export class HTTPRouter {
  private routes: Route[] = [];

  /**
   * Add route
   */
  addRoute(method: HTTPMethod | '*', pattern: string, handler: RouteHandler): void {
    const route: Route = {
      method,
      pattern,
      handler,
    };

    // Compile pattern to regex
    if (pattern.includes(':') || pattern.includes('*')) {
      const { regex, paramNames } = this.compilePattern(pattern);
      route.regex = regex;
      route.paramNames = paramNames;
    }

    this.routes.push(route);
  }

  /**
   * Match request to route
   */
  match(method: string, path: string): RouteMatch | null {
    for (const route of this.routes) {
      // Check method
      if (route.method !== '*' && route.method !== method) {
        continue;
      }

      // Exact match (no parameters)
      if (!route.regex) {
        if (route.pattern === path) {
          return {
            handler: route.handler,
            params: {},
          };
        }
        continue;
      }

      // Regex match (with parameters)
      const match = route.regex.exec(path);
      if (match) {
        const params: Record<string, string> = {};
        
        if (route.paramNames) {
          route.paramNames.forEach((name, index) => {
            params[name] = match[index + 1];
          });
        }

        return {
          handler: route.handler,
          params,
        };
      }
    }

    return null;
  }

  /**
   * Compile pattern to regex
   */
  private compilePattern(pattern: string): { regex: RegExp; paramNames: string[] } {
    const paramNames: string[] = [];

    // Build regex safely: escape all regex chars, then re-introduce our tokens.
    // Tokens:
    //  - :param   => capture group ([^/]+)
    //  - *        => capture group (.*)
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Replace tokens with placeholders so we can escape safely
    const PARAM_PLACEHOLDER = '__PARAM__';
    const WILDCARD_PLACEHOLDER = '__WILDCARD__';

    const parts: Array<{ kind: 'text' | 'param' | 'wildcard'; value: string }> = [];
    let i = 0;
    while (i < pattern.length) {
      const ch = pattern[i];
      if (ch === '*') {
        parts.push({ kind: 'wildcard', value: '*' });
        i += 1;
        continue;
      }

      if (ch === ':') {
        // parse identifier
        let j = i + 1;
        while (j < pattern.length && /[a-zA-Z0-9_]/.test(pattern[j])) {
          j += 1;
        }
        const name = pattern.slice(i + 1, j);
        if (name.length === 0) {
          // treat ':' as literal
          parts.push({ kind: 'text', value: ':' });
          i += 1;
          continue;
        }
        parts.push({ kind: 'param', value: name });
        i = j;
        continue;
      }

      // accumulate text
      let j = i;
      while (j < pattern.length && pattern[j] !== '*' && pattern[j] !== ':') {
        j += 1;
      }
      parts.push({ kind: 'text', value: pattern.slice(i, j) });
      i = j;
    }

    let regexPattern = '^';
    for (const part of parts) {
      if (part.kind === 'text') {
        regexPattern += escapeRegex(part.value);
      } else if (part.kind === 'wildcard') {
        regexPattern += '(.*)';
      } else {
        paramNames.push(part.value);
        regexPattern += '([^/]+)';
      }
    }
    regexPattern += '$';

    return {
      regex: new RegExp(regexPattern),
      paramNames,
    };
  }

  /**
   * Get all routes
   */
  getRoutes(): Route[] {
    return [...this.routes];
  }

  /**
   * Clear all routes
   */
  clear(): void {
    this.routes = [];
  }
}

/**
 * Factory function
 */
export function createRouter(): HTTPRouter {
  return new HTTPRouter();
}
