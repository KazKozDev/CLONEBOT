/**
 * Request and Response Objects
 * 
 * Convenient wrappers around IncomingMessage and ServerResponse
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { Request as RequestType, Response as ResponseType, AuthInfo, SSEWriter } from './types';
import type { Readable } from 'stream';
import { createSSEWriter } from './sse-handler';

/**
 * Parse query string
 */
export function parseQueryString(queryString: string): Record<string, string> {
  const params: Record<string, string> = {};
  
  if (!queryString) {
    return params;
  }

  const pairs = queryString.split('&');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key) {
      params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
    }
  }

  return params;
}

/**
 * Parse request body
 */
export async function parseBody(req: IncomingMessage, maxSize: number = 10 * 1024 * 1024): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      
      if (size > maxSize) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      
      if (!body) {
        resolve(null);
        return;
      }

      // Try to parse as JSON
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error('Invalid JSON body'));
        }
      } else {
        resolve(body);
      }
    });

    req.on('error', reject);
  });
}

/**
 * Request wrapper
 */
export class Request implements RequestType {
  method: string;
  path: string;
  params: Record<string, string> = {};
  query: Record<string, string>;
  headers: Record<string, string>;
  body: any = null;
  ip: string;
  userAgent: string;
  auth?: AuthInfo;
  raw: IncomingMessage;

  constructor(req: IncomingMessage, params: Record<string, string> = {}) {
    this.raw = req;
    this.method = req.method?.toUpperCase() || 'GET';

    // Parse URL
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url || '/', `http://${host}`);
    this.path = url.pathname;
    this.query = parseQueryString(url.search.substring(1));

    // Parameters from routing
    this.params = params;

    // Headers (case-insensitive)
    this.headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        this.headers[key.toLowerCase()] = value;
      } else if (Array.isArray(value)) {
        this.headers[key.toLowerCase()] = value[0] || '';
      }
    }

    // Client info
    this.ip = this.getClientIp(req);
    this.userAgent = req.headers['user-agent'] || 'Unknown';
  }

  /**
   * Get header (case-insensitive)
   */
  getHeader(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }

  /**
   * Extract client IP
   */
  private getClientIp(req: IncomingMessage): string {
    // Check X-Forwarded-For header
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim();
    }

    // Check X-Real-IP header
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    // Use socket address
    return req.socket.remoteAddress || 'unknown';
  }
}

/**
 * Response wrapper
 */
export class Response implements ResponseType {
  private _sent = false;
  private _statusCode = 200;
  private _headers: Record<string, string | number> = {};
  private _sseWriter: SSEWriter | null = null;
  raw: ServerResponse;

  constructor(res: ServerResponse) {
    this.raw = res;
  }

  get sent(): boolean {
    return this._sent;
  }

  /**
   * Set status code
   */
  status(code: number): this {
    if (this._sent) {
      throw new Error('Response already sent');
    }
    this._statusCode = code;
    return this;
  }

  /**
   * Set header
   */
  header(name: string, value: string | number): this {
    if (this._sent) {
      throw new Error('Response already sent');
    }
    this._headers[name] = value;
    return this;
  }

  /**
   * Send JSON response
   */
  json(data: any): void {
    if (this._sent) {
      throw new Error('Response already sent');
    }

    this.header('Content-Type', 'application/json');
    const body = JSON.stringify(data);
    this.send(body);
  }

  /**
   * Send text response
   */
  text(data: string): void {
    if (this._sent) {
      throw new Error('Response already sent');
    }

    this.header('Content-Type', 'text/plain');
    this.send(data);
  }

  /**
   * Redirect
   */
  redirect(url: string, code: number = 302): void {
    if (this._sent) {
      throw new Error('Response already sent');
    }

    this.status(code);
    this.header('Location', url);
    this.send();
  }

  /**
   * Stream response
   */
  stream(readable: Readable): void {
    if (this._sent) {
      throw new Error('Response already sent');
    }

    this._sent = true;
    if (!this.raw.headersSent) {
      this.writeHead();
    }
    readable.pipe(this.raw);
  }

  /**
   * Create SSE writer
   */
  sse(): SSEWriter {
    if (this._sent && !this._sseWriter) {
      throw new Error('Response already sent');
    }

    if (this._sseWriter) {
      return this._sseWriter;
    }

    // Apply any queued headers (e.g., CORS) to the raw response
    for (const [name, value] of Object.entries(this._headers)) {
      this.raw.setHeader(name, value as string | number);
    }

    // Mark sent and create SSE writer (sets headers + keep-alive)
    this._sent = true;
    this._sseWriter = createSSEWriter(this.raw);
    return this._sseWriter;
  }

  /**
   * Send response
   */
  send(body?: string): void {
    if (this._sent) {
      throw new Error('Response already sent');
    }

    this._sent = true;
    if (this.raw.headersSent) {
      if (!this.raw.writableEnded) {
        this.raw.end(body);
      }
      return;
    }

    this.writeHead();

    if (body) {
      this.raw.end(body);
    } else {
      this.raw.end();
    }
  }

  /**
   * Write headers
   */
  private writeHead(): void {
    if (this.raw.headersSent) {
      return;
    }
    this.raw.writeHead(this._statusCode, this._headers);
  }
}

/**
 * Create Request from IncomingMessage
 */
export function createRequest(req: IncomingMessage, params?: Record<string, string>): Request {
  return new Request(req, params);
}

/**
 * Create Response from ServerResponse
 */
export function createResponse(res: ServerResponse): Response {
  return new Response(res);
}
