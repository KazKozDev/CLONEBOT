/**
 * Basic HTTP Server
 * 
 * Simple HTTP server wrapper with lifecycle management
 */

import http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import type { AddressInfo } from 'net';

export interface HTTPServerConfig {
  host: string;
  port: number;
}

export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

export class HTTPServer {
  private server: http.Server | null = null;
  private requestHandler: RequestHandler | null = null;
  private config: HTTPServerConfig;

  constructor(config: HTTPServerConfig) {
    this.config = config;
  }

  /**
   * Set request handler
   */
  onRequest(handler: RequestHandler): void {
    this.requestHandler = handler;
  }

  /**
   * Start server
   */
  async start(): Promise<void> {
    if (this.server) {
      throw new Error('Server already running');
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        try {
          if (this.requestHandler) {
            await this.requestHandler(req, res);
          } else {
            res.statusCode = 503;
            res.end('Service Unavailable');
          }
        } catch (error) {
          res.statusCode = 500;
          res.end('Internal Server Error');
        }
      });

      this.server.on('error', reject);

      this.server.listen(this.config.port, this.config.host, () => {
        resolve();
      });
    });
  }

  /**
   * Stop server
   */
  async stop(options?: { graceful?: boolean; timeout?: number }): Promise<void> {
    if (!this.server) {
      return;
    }

    const graceful = options?.graceful ?? true;
    const timeout = options?.timeout ?? 10000;

    return new Promise((resolve, reject) => {
      const server = this.server!;

      if (!graceful) {
        // Force close
        server.close((err) => {
          this.server = null;
          if (err) reject(err);
          else resolve();
        });
        return;
      }

      // Graceful shutdown
      const timeoutId = setTimeout(() => {
        // Force close after timeout
        server.closeAllConnections?.();
        server.close(() => {
          this.server = null;
          resolve();
        });
      }, timeout);

      server.close((err) => {
        clearTimeout(timeoutId);
        this.server = null;
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }

  /**
   * Get server address
   */
  getAddress(): { host: string; port: number } | null {
    if (!this.server || !this.server.listening) {
      return null;
    }

    const address = this.server.address() as AddressInfo;
    return {
      host: address.address,
      port: address.port,
    };
  }

  /**
   * Get underlying server instance
   */
  getServerInstance(): http.Server | null {
    return this.server;
  }
}

/**
 * Factory function
 */
export function createHTTPServer(config: HTTPServerConfig): HTTPServer {
  return new HTTPServer(config);
}
