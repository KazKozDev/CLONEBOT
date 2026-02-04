/**
 * WebSocket Upgrade Handler
 * 
 * Handles HTTP → WebSocket upgrade and connection management
 */

import type { IncomingMessage, Server as HTTPServer } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer, WebSocket } from 'ws';
import type { WebSocketConnection as WSConnection, ConnectionMetadata } from './types';

export interface WebSocketUpgradeOptions {
  /** Only accept upgrades for this pathname (e.g. '/ws') */
  path?: string;

  /** Require/negotiate this subprotocol (e.g. 'openclaw-v1') */
  subprotocol?: string;

  /** Heartbeat ping interval (ms). Set to 0 to disable. */
  heartbeatIntervalMs?: number;
}

/**
 * Check if request is WebSocket upgrade
 */
export function isUpgradeRequest(req: IncomingMessage): boolean {
  const upgrade = req.headers.upgrade;
  return upgrade !== undefined && upgrade.toLowerCase() === 'websocket';
}

/**
 * WebSocket Connection wrapper
 */
export class WebSocketConnection implements WSConnection {
  id: string;
  ws: WebSocket;
  metadata: ConnectionMetadata;
  subscriptions: Set<string> = new Set();

  constructor(id: string, ws: WebSocket, metadata: ConnectionMetadata) {
    this.id = id;
    this.ws = ws;
    this.metadata = metadata;
  }

  /**
   * Send message
   */
  send(message: any): void {
    if (this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const data = typeof message === 'string' ? message : JSON.stringify(message);
    this.ws.send(data);
  }

  /**
   * Close connection
   */
  close(code?: number, reason?: string): void {
    this.ws.close(code, reason);
  }

  /**
   * Subscribe to channel
   */
  subscribe(channel: string): void {
    this.subscriptions.add(channel);
  }

  /**
   * Unsubscribe from channel
   */
  unsubscribe(channel: string): void {
    this.subscriptions.delete(channel);
  }

  /**
   * Check if connection is alive
   */
  isAlive(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }
}

/**
 * WebSocket Upgrade Handler
 */
export class WebSocketUpgradeHandler {
  private wss: WebSocketServer;
  private connections = new Map<string, WebSocketConnection>();
  private connectionIdCounter = 0;

  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly heartbeatIntervalMs: number;

  private readonly path?: string;
  private readonly subprotocol?: string;

  private onConnectionHandler?: (connection: WebSocketConnection) => void;
  private onDisconnectionHandler?: (connection: WebSocketConnection) => void;
  private onMessageHandler?: (data: any, connection: WebSocketConnection) => void;

  constructor(httpServer: HTTPServer, options: WebSocketUpgradeOptions = {}) {
    this.path = options.path;
    this.subprotocol = options.subprotocol;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30_000;

    this.wss = new WebSocketServer({
      noServer: true,
      handleProtocols: (protocols) => {
        if (!this.subprotocol) return false;
        return protocols.has(this.subprotocol) ? this.subprotocol : false;
      },
    });

    // Handle upgrade requests
    httpServer.on('upgrade', (req, socket, head) => {
      if (!isUpgradeRequest(req)) {
        socket.destroy();
        return;
      }

      if (this.path) {
        const host = req.headers.host || 'localhost';
        const url = new URL(req.url || '/', `http://${host}`);
        if (url.pathname !== this.path) {
          this.rejectUpgrade(socket, 404, 'Not Found');
          return;
        }
      }

      if (this.subprotocol) {
        const raw = req.headers['sec-websocket-protocol'];
        const header = Array.isArray(raw) ? raw.join(',') : (raw || '');
        const protocols = header
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);

        if (!protocols.includes(this.subprotocol)) {
          this.rejectUpgrade(socket, 400, 'Bad Request');
          return;
        }
      }

      this.handleUpgrade(req, socket, head);
    });

    if (this.heartbeatIntervalMs > 0) {
      this.heartbeatTimer = setInterval(() => this.heartbeat(), this.heartbeatIntervalMs);
      this.heartbeatTimer.unref?.();
    }
  }

  private heartbeat(): void {
    for (const connection of this.connections.values()) {
      if (connection.ws.readyState !== WebSocket.OPEN) {
        continue;
      }

      const wsAny = connection.ws as any;
      if (wsAny.isAlive === false) {
        try {
          connection.ws.terminate();
        } catch {
          // ignore
        }
        continue;
      }

      wsAny.isAlive = false;
      try {
        connection.ws.ping();
      } catch {
        // ignore
      }
    }
  }

  private rejectUpgrade(socket: Duplex, statusCode: number, statusText: string): void {
    try {
      socket.write(
        `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
          'Connection: close\r\n' +
          '\r\n'
      );
    } finally {
      socket.destroy();
    }
  }

  /**
   * Handle WebSocket upgrade
   */
  private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      // Create connection
      const connectionId = `ws-${++this.connectionIdCounter}`;
      
      const metadata: ConnectionMetadata = {
        ip: this.extractClientIp(req),
        userAgent: req.headers['user-agent'] || 'Unknown',
        connectedAt: Date.now(),
        lastActivityAt: Date.now(),
        subscriptions: new Set(),
        custom: {
          url: req.url || '/',
          headers: req.headers,
        },
      };

      const connection = new WebSocketConnection(connectionId, ws, metadata);
      this.connections.set(connectionId, connection);

      // Setup event handlers
      (ws as any).isAlive = true;

      ws.on('pong', () => {
        (ws as any).isAlive = true;
        connection.metadata.lastActivityAt = Date.now();
      });

      ws.on('message', (data) => {
        connection.metadata.lastActivityAt = Date.now();
        if (this.onMessageHandler) {
          try {
            const parsed = JSON.parse(data.toString());
            this.onMessageHandler(parsed, connection);
          } catch (error) {
            // Invalid JSON
          }
        }
      });

      ws.on('close', () => {
        this.connections.delete(connectionId);
        if (this.onDisconnectionHandler) {
          this.onDisconnectionHandler(connection);
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      // Notify connection handler
      if (this.onConnectionHandler) {
        this.onConnectionHandler(connection);
      }

      this.wss.emit('connection', ws, req);
    });
  }

  /**
   * Set connection handler
   */
  onConnection(handler: (connection: WebSocketConnection) => void): void {
    this.onConnectionHandler = handler;
  }

  /**
   * Set disconnection handler
   */
  onDisconnection(handler: (connection: WebSocketConnection) => void): void {
    this.onDisconnectionHandler = handler;
  }

  /**
   * Set message handler
   */
  onMessage(handler: (data: any, connection: WebSocketConnection) => void): void {
    this.onMessageHandler = handler;
  }

  /**
   * Get connection by ID
   */
  getConnection(id: string): WebSocketConnection | undefined {
    return this.connections.get(id);
  }

  /**
   * Get all connections
   */
  getConnections(): WebSocketConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Broadcast to all connections
   */
  broadcast(message: any, filter?: (connection: WebSocketConnection) => boolean): void {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    
    for (const connection of this.connections.values()) {
      if (filter && !filter(connection)) {
        continue;
      }

      if (connection.isAlive()) {
        connection.ws.send(data);
      }
    }
  }

  /**
   * Close all connections
   */
  closeAll(code?: number, reason?: string): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    for (const connection of this.connections.values()) {
      connection.close(code, reason);
    }
    this.connections.clear();
  }

  /**
   * Extract client IP
   */
  private extractClientIp(req: IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim();
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    return req.socket.remoteAddress || 'unknown';
  }
}

/**
 * Factory function
 */
export function createWebSocketHandler(
  httpServer: HTTPServer,
  options?: WebSocketUpgradeOptions
): WebSocketUpgradeHandler {
  return new WebSocketUpgradeHandler(httpServer, options);
}
