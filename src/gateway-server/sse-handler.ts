/**
 * Server-Sent Events (SSE) Handler
 * 
 * Real-time event streaming over HTTP
 */

import type { ServerResponse } from 'http';
import type { SSEWriter } from './types';

/**
 * SSE Writer implementation
 */
export class SSEWriterImpl implements SSEWriter {
  private res: ServerResponse;
  private closed = false;
  private keepAliveTimer: NodeJS.Timeout | null = null;

  constructor(res: ServerResponse) {
    this.res = res;
    this.initializeSSE();
  }

  /**
   * Initialize SSE connection
   */
  private initializeSSE(): void {
    // Get existing headers (including CORS)
    const existingHeaders = this.res.getHeaders();
    
    // Set SSE headers while preserving existing ones
    this.res.writeHead(200, {
      ...existingHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send initial comment
    this.comment('SSE connection established');

    // Handle client disconnect
    this.res.on('close', () => {
      this.close();
    });
  }

  /**
   * Send event
   */
  send(event: string, data: any, id?: string): void {
    if (this.closed) {
      return;
    }

    let message = '';

    // Event type
    if (event) {
      message += `event: ${event}\n`;
    }

    // Event ID
    if (id) {
      message += `id: ${id}\n`;
    }

    // Data (can be multi-line)
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    const lines = dataString.split('\n');
    for (const line of lines) {
      message += `data: ${line}\n`;
    }

    // End with blank line
    message += '\n';

    this.res.write(message);
  }

  /**
   * Send comment (keep-alive)
   */
  comment(text: string): void {
    if (this.closed) {
      return;
    }

    this.res.write(`: ${text}\n\n`);
  }

  /**
   * Close SSE stream
   */
  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.stopKeepAlive();

    if (!this.res.destroyed) {
      this.res.end();
    }
  }

  /**
   * Start keep-alive (periodic comments)
   */
  keepAlive(intervalMs: number): void {
    this.stopKeepAlive();

    this.keepAliveTimer = setInterval(() => {
      this.comment('keep-alive');
    }, intervalMs);
  }

  /**
   * Stop keep-alive
   */
  stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  /**
   * Check if closed
   */
  isClosed(): boolean {
    return this.closed;
  }
}

/**
 * Create SSE writer from response
 */
export function createSSEWriter(res: ServerResponse): SSEWriter {
  return new SSEWriterImpl(res);
}

/**
 * SSE middleware helper
 */
export function handleSSE(res: ServerResponse, handler: (writer: SSEWriter) => void | Promise<void>): void {
  const writer = createSSEWriter(res);

  // Start keep-alive (every 30 seconds)
  writer.keepAlive(30000);

  // Call handler
  Promise.resolve(handler(writer)).catch((error) => {
    console.error('SSE handler error:', error);
    writer.close();
  });
}
